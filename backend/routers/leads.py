


from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlmodel import select
from sqlalchemy import or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from models import Lead, User, Campaign, LeadHistory, LeadBatch
from database import get_session
from auth_utils import get_current_user
from schemas import LeadOut, LeadListResponse
from typing import List

import csv
from io import StringIO
from collections import defaultdict, deque
import os
import requests
import time
import logging
from fastapi.responses import StreamingResponse
from datetime import datetime
import re
import uuid
import socket
import unicodedata
try:
    from difflib import SequenceMatcher
except ImportError:
    SequenceMatcher = None
def normalize_str(s):
    if not s:
        return ""
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]', '', s.lower())

def fuzzy_similar(a, b):
    if not a or not b:
        return False
    if SequenceMatcher:
        ratio = SequenceMatcher(None, a, b).ratio()
        return ratio > 0.85
    return a == b

router = APIRouter(prefix="/api/leads", tags=["leads"])

# Import subscription plans
from routers.subscriptions import SUBSCRIPTION_PLANS

ENRICH_RATE_LIMIT = 10  # requests
ENRICH_RATE_PERIOD = 60  # seconds
user_enrich_timestamps = defaultdict(lambda: deque(maxlen=ENRICH_RATE_LIMIT))

def check_enrich_rate_limit(user_id: int):
    now = time.time()
    timestamps = user_enrich_timestamps[user_id]
    # Remove timestamps older than ENRICH_RATE_PERIOD
    while timestamps and now - timestamps[0] > ENRICH_RATE_PERIOD:
        timestamps.popleft()
    if len(timestamps) >= ENRICH_RATE_LIMIT:
        return False
    timestamps.append(now)
    return True

def is_valid_email(email: str) -> bool:
    if not email:
        return False
    # Basic regex check
    if not re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", email):
        return False
    # MX record check for domain
    try:
        domain = email.split('@')[1]
        # Use socket.getaddrinfo as a lightweight DNS check (not full MX, but avoids extra dependencies)
        socket.getaddrinfo(domain, None)
        return True
    except Exception:
        return False

# Enhanced upload: deduplication, validation, Hunter.io enrichment
@router.post("/upload")
async def upload_leads(req: dict, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    plan = SUBSCRIPTION_PLANS.get(user.subscription_tier, SUBSCRIPTION_PLANS["free"])
    limit = plan["leads_limit"]

    batch_name = req.get("batch_name")
    if not batch_name:
        raise HTTPException(status_code=400, detail="batch_name is required")
    # Check if batch exists for this user and name
    batch_result = await session.execute(select(LeadBatch).where(LeadBatch.name == batch_name, LeadBatch.user_id == user.id))
    batch = batch_result.scalar_one_or_none()
    if not batch:
        batch = LeadBatch(name=batch_name, user_id=user.id)
        session.add(batch) 
        await session.flush()
        await session.commit()
        await session.refresh(batch)
    # Count and dedupe against all leads owned by user via campaign OR batch
    leads_result = await session.execute(
        select(Lead)
        .join(Campaign, isouter=True)
        .join(LeadBatch, Lead.batch_id == LeadBatch.id, isouter=True)
        .where(or_(Campaign.user_id == user.id, LeadBatch.user_id == user.id))
    )
    existing_leads = leads_result.scalars().all()
    leads_count = len(existing_leads)
    warning_threshold = limit * 0.8
    is_near_limit = leads_count >= warning_threshold
    is_over_limit = leads_count >= limit
    if is_over_limit:
        return {
            "message": f"Upload completed, but you've reached your {user.subscription_tier} plan limit of {limit} leads. Consider upgrading for more capacity.",
            "leads_created": 0,
            "warning": "limit_reached",
            "current_usage": leads_count,
            "limit": limit,
            "upgrade_required": True
        }
    csv_data = req.get("csvData", "")
    if not csv_data:
        raise HTTPException(status_code=400, detail="No CSV data provided")
    leads_created = 0
    reader = csv.DictReader(StringIO(csv_data))
    required_columns = {"first_name", "last_name", "company", "profile_url", "job_title"}
    missing_columns = required_columns - set(reader.fieldnames or [])
    if missing_columns:
        return {
            "message": f"CSV missing required columns: {', '.join(missing_columns)}",
            "leads_created": 0,
            "current_usage": leads_count,
            "limit": limit,
            "warning": "csv_invalid",
            "row_errors": []
        }
    # Prepare normalized existing leads for fuzzy matching
    deduped = [
        (normalize_str(l.first_name), normalize_str(l.last_name), normalize_str(l.company), normalize_str(l.profile_url))
        for l in existing_leads
    ]
    existing_emails = set(getattr(l, "email", None) for l in existing_leads if getattr(l, "email", None))
    row_errors = []
    for idx, row in enumerate(reader, start=2):  # start=2 to account for header row as row 1
        key = (
            normalize_str(row.get("first_name", "")),
            normalize_str(row.get("last_name", "")),
            normalize_str(row.get("company", "")),
            normalize_str(row.get("profile_url", ""))
        )
        email = row.get("email", "").strip()
        # Email format validation if present
        if email and not is_valid_email(email):
            row_errors.append({"row": idx, "reason": "Invalid email format", "row_data": row})
            continue  # skip invalid emails
        # Fuzzy duplicate check
        is_duplicate = False
        for exist in deduped:
            # Fuzzy match on name and company, exact on profile_url if present
            if (
                fuzzy_similar(key[0], exist[0]) and
                fuzzy_similar(key[1], exist[1]) and
                fuzzy_similar(key[2], exist[2]) and
                (not key[3] or not exist[3] or fuzzy_similar(key[3], exist[3]))
            ):
                is_duplicate = True
                break
        if is_duplicate or (email and email in existing_emails):
            row_errors.append({"row": idx, "reason": "Duplicate lead (fuzzy)", "row_data": row})
            continue  # skip duplicate
        if leads_created + leads_count >= limit:
            row_errors.append({"row": idx, "reason": "Plan lead limit reached", "row_data": row})
            break
        try:
            lead = Lead(
                first_name=row.get("first_name", ""),
                last_name=row.get("last_name", ""),
                job_title=row.get("job_title", ""),
                company=row.get("company", ""),
                profile_url=row.get("profile_url", ""),
                status="pending",
                batch_id=batch.id,
                email=email if email else None
            )
            session.add(lead)
            session.add(LeadHistory(
                lead_id=lead.id,
                user_id=user.id,
                action="created",
                field=None,
                old_value=None,
                new_value=None
            ))
            leads_created += 1
            deduped.append(key)
            if email:
                existing_emails.add(email)
        except Exception as e:
            row_errors.append({"row": idx, "reason": f"Exception: {str(e)}", "row_data": row})
    try:
        await session.commit()
        logger.info(f"User {user.id} uploaded {leads_created} leads to batch '{batch_name}'")
    except Exception as e:
        logger.error(f"User {user.id} failed to upload leads: {str(e)}")
        raise
    response = {
        "message": f"Successfully uploaded {leads_created} leads",
        "leads_created": leads_created,
        "current_usage": leads_count + leads_created,
        "limit": limit,
        "row_errors": row_errors
    }
    if is_near_limit and not is_over_limit:
        response["warning"] = "approaching_limit"
        response["message"] += f". You're approaching your {user.subscription_tier} plan limit ({leads_count + leads_created}/{limit} leads)."
    return response




task_status = {}
# Track cancelled tasks
cancelled_tasks = set()
@router.post("/cancel-task/{task_id}")
async def cancel_task(task_id: str):
    cancelled_tasks.add(task_id)
    # Optionally update status immediately
    if task_id in task_status:
        task_status[task_id]["status"] = "cancelled"
        task_status[task_id]["step"] = "Task cancelled by user"
    return {"message": f"Task {task_id} cancellation requested."}

def set_task_status(task_id, status, result=None):
    # Allow progress reporting
    if isinstance(result, dict) and "progress" in result:
        task_status[task_id] = {"status": status, **result}
    else:
        task_status[task_id] = {"status": status, "result": result}

def get_task_status(task_id):
    return task_status.get(task_id, {"status": "unknown"})


# Synchronous enrichment endpoint for frontend compatibility
@router.post("/enrich-email")
async def enrich_lead_email(
    req: dict,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    if not check_enrich_rate_limit(user.id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded: max 10 enrichment requests per minute.")
    lead_id = req.get("leadId")
    if not lead_id:
        raise HTTPException(status_code=400, detail="leadId required")
    result = await apollo_enrich_lead_email({"leadId": lead_id}, session, user)
    # Audit log for enrichment
    lead_result = await session.execute(select(Lead).where(Lead.id == lead_id))
    lead = lead_result.scalar_one_or_none()
    if lead and result.get("email"):
        session.add(LeadHistory(
            lead_id=lead.id,
            user_id=user.id,
            action="enriched",
            field="email",
            old_value=None,
            new_value=result.get("email")
        ))
        await session.commit()
    return result
@router.post("/enrich-email-bg")
async def enrich_lead_email_bg(
    req: dict,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    if not check_enrich_rate_limit(user.id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded: max 10 enrichment requests per minute.")
    lead_id = req.get("leadId")
    if not lead_id:
        raise HTTPException(status_code=400, detail="leadId required")
    task_id = str(uuid.uuid4())
    set_task_status(task_id, "pending")
    async def run_enrich():
        try:
            result = await apollo_enrich_lead_email({"leadId": lead_id}, session, user)
            set_task_status(task_id, "done", result)
            logger.info(f"User {user.id} background enriched lead {lead_id}")
        except Exception as e:
            set_task_status(task_id, "error", str(e))
            logger.error(f"User {user.id} failed background enrich for lead {lead_id}: {str(e)}")
    background_tasks.add_task(run_enrich)
    return {"task_id": task_id}

@router.get("/task-status/{task_id}")
async def get_enrich_task_status(task_id: str):
    return get_task_status(task_id)


@router.post("/bulk-enrich-bg")
async def bulk_enrich_leads_bg(
    req: dict = Body(...),
    background_tasks: BackgroundTasks = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    if not check_enrich_rate_limit(user.id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded: max 10 enrichment requests per minute.")
    lead_ids = req.get("leadIds", [])
    if not lead_ids:
        raise HTTPException(status_code=400, detail="leadIds are required")
    task_id = str(uuid.uuid4())
    set_task_status(task_id, "pending", {"progress": 0, "step": "Starting bulk enrichment"})
    async def run_bulk_enrich():
        enriched = []
        failed = []
        total = len(lead_ids)
        for idx, lead_id in enumerate(lead_ids):
            if task_id in cancelled_tasks:
                set_task_status(task_id, "cancelled", {"progress": int(((idx) / total) * 100), "step": "Task cancelled by user", "enriched": enriched, "failed": failed})
                logger.info(f"User {user.id} cancelled bulk enrichment at {idx}/{total}")
                return
            try:
                result = await apollo_enrich_lead_email({"leadId": lead_id}, session, user)
                if result.get("email"):
                    enriched.append(lead_id)
                else:
                    failed.append(lead_id)
            except Exception:
                failed.append(lead_id)
            # Update progress after each lead
            progress = int(((idx + 1) / total) * 100)
            set_task_status(task_id, "in-progress", {"progress": progress, "step": f"Enriched {idx+1}/{total} leads", "enriched": enriched, "failed": failed})
        set_task_status(task_id, "done", {"progress": 100, "step": "Bulk enrichment complete", "enriched": enriched, "failed": failed})
        logger.info(f"User {user.id} background bulk enriched {len(enriched)} leads")
    if background_tasks:
        background_tasks.add_task(run_bulk_enrich)
    else:
        import threading
        threading.Thread(target=lambda: asyncio.run(run_bulk_enrich())).start()
    return {"task_id": task_id}

@router.post("/scrape-linkedin-leads-bg")
async def scrape_linkedin_leads_bg(
    req: dict = Body(...),
    background_tasks: BackgroundTasks = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    task_id = str(uuid.uuid4())
    set_task_status(task_id, "pending", {"progress": 0, "step": "Starting LinkedIn scrape"})
    def run_scrape():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Simulate progress for scraping (since scrape_linkedin_leads returns all at once)
            set_task_status(task_id, "in-progress", {"progress": 10, "step": "Scraping in progress"})
            if task_id in cancelled_tasks:
                set_task_status(task_id, "cancelled", {"progress": 10, "step": "Task cancelled by user"})
                logger.info(f"User {user.id} cancelled LinkedIn scrape")
                return
            coro = scrape_linkedin_leads(req, user)
            result = loop.run_until_complete(coro)
            if task_id in cancelled_tasks:
                set_task_status(task_id, "cancelled", {"progress": 100, "step": "Task cancelled by user after scrape", "result": result})
                logger.info(f"User {user.id} cancelled LinkedIn scrape after completion")
                return
            set_task_status(task_id, "done", {"progress": 100, "step": "Scraping complete", "result": result})
            logger.info(f"User {user.id} background scraped LinkedIn leads")
        except Exception as e:
            set_task_status(task_id, "error", {"progress": 100, "step": "Error", "error": str(e)})
            logger.error(f"User {user.id} failed background LinkedIn scrape: {str(e)}")
        finally:
            loop.close()
    if background_tasks:
        background_tasks.add_task(run_scrape)
    else:
        import threading
        threading.Thread(target=run_scrape).start()
    return {"task_id": task_id}


@router.get("/list", response_model=LeadListResponse)
async def list_leads(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    unassigned: bool = False,
    offset: int = 0,
    limit: int = 20,
    company: str = None,
    job_title: str = None,
    status: str = None,
    enriched: bool = None,
    search: str = None,
    email: str = None,
    profile_url: str = None,
    batch_id: int = None
):
    plan = SUBSCRIPTION_PLANS.get(user.subscription_tier, SUBSCRIPTION_PLANS["free"])
    max_limit = plan["leads_limit"]
    # Include leads owned by user either via campaign ownership or batch ownership
    base_query = (
        select(Lead)
        .join(Campaign, isouter=True)
        .join(LeadBatch, Lead.batch_id == LeadBatch.id, isouter=True)
        .where(or_(Campaign.user_id == user.id, LeadBatch.user_id == user.id))
    )
    if batch_id:
        base_query = base_query.where(Lead.batch_id == batch_id)
    # Filtering
    if unassigned:
        base_query = base_query.where(Lead.campaign_id == None)
    if company:
        base_query = base_query.where(Lead.company.ilike(f"%{company}%"))
    if job_title:
        base_query = base_query.where(Lead.job_title.ilike(f"%{job_title}%"))
    if status:
        base_query = base_query.where(Lead.status == status)
    if enriched is not None:
        if enriched:
            base_query = base_query.where(Lead.email != None)
        else:
            base_query = base_query.where(Lead.email == None)
    if email:
        base_query = base_query.where(Lead.email.ilike(f"%{email}%"))
    if profile_url:
        base_query = base_query.where(Lead.profile_url.ilike(f"%{profile_url}%"))
    # Advanced search (across more fields)
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            (Lead.first_name.ilike(search_pattern)) |
            (Lead.last_name.ilike(search_pattern)) |
            (Lead.company.ilike(search_pattern)) |
            (Lead.job_title.ilike(search_pattern)) |
            (Lead.email.ilike(search_pattern)) |
            (Lead.profile_url.ilike(search_pattern))
        )
    # Get total count for pagination (COUNT(*))
    count_query = base_query.with_only_columns(func.count(Lead.id)).order_by(None)
    total_result = await session.execute(count_query)
    total_count = total_result.scalar() or 0
    # Pagination
    query = base_query.offset(offset).limit(min(limit, max_limit))
    result = await session.execute(query)
    leads = result.scalars().all()
    return {"leads": leads, "total": total_count, "offset": offset, "limit": limit}

@router.put("/{lead_id}")
async def update_lead(lead_id: int, req: dict, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    # Get lead and verify it belongs to user via campaign or batch
    result = await session.execute(
        select(Lead)
        .join(Campaign, isouter=True)
        .join(LeadBatch, Lead.batch_id == LeadBatch.id, isouter=True)
        .where(Lead.id == lead_id)
        .where(or_(Campaign.user_id == user.id, LeadBatch.user_id == user.id))
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    status_before = lead.status
    # Allow updating select core fields
    updatable_fields = [
        "status", "first_name", "last_name", "job_title", "company", "profile_url", "message_text"
    ]
    for field_name in updatable_fields:
        if field_name in req:
            old_value = getattr(lead, field_name)
            new_value = req[field_name]
            setattr(lead, field_name, new_value)
            if field_name == "status" or old_value != new_value:
                session.add(LeadHistory(
                    lead_id=lead.id,
                    user_id=user.id,
                    action="updated",
                    field=field_name,
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(new_value) if new_value is not None else None
                ))
    session.add(lead)
    try:
        await session.commit()
        logger.info(f"User {user.id} updated lead {lead_id} (status: {lead.status})")
    except Exception as e:
        logger.error(f"User {user.id} failed to update lead {lead_id}: {str(e)}")
        raise
    # Notification trigger for lead update
    if status_before != lead.status:
        from models import Notification
        notification = Notification(
            user_id=user.id,
            type="lead_updated",
            message=f"Lead '{lead.first_name} {lead.last_name}' status updated to '{lead.status}'.",
            created_at=datetime.utcnow()
        )
        session.add(notification)
        await session.commit()
    return {"message": "Lead updated"}

@router.delete("/{lead_id}")
async def delete_lead(lead_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    # Get lead and verify it belongs to user via campaign or batch
    result = await session.execute(
        select(Lead)
        .join(Campaign, isouter=True)
        .join(LeadBatch, Lead.batch_id == LeadBatch.id, isouter=True)
        .where(Lead.id == lead_id)
        .where(or_(Campaign.user_id == user.id, LeadBatch.user_id == user.id))
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    session.add(LeadHistory(
        lead_id=lead.id,
        user_id=user.id,
        action="deleted",
        field=None,
        old_value=None,
        new_value=None
    ))
    try:
        await session.delete(lead)
        await session.commit()
        logger.info(f"User {user.id} deleted lead {lead_id}")
    except Exception as e:
        logger.error(f"User {user.id} failed to delete lead {lead_id}: {str(e)}")
        raise
    return {"message": "Lead deleted"}

import asyncio
import httpx
from models import User, Notification
from database import get_session


@router.post("/scrape-linkedin-leads")
async def scrape_linkedin_leads(
    req: dict = Body(...),
    user: User = Depends(get_current_user)
):
    # 1. Pick API key from user record or fallback env
    apollo_key = "OK32YqkeuWZ2XII25SG_7A"
    if not apollo_key:
        raise HTTPException(status_code=400, detail="Apollo API key not configured.")

    url = "https://api.apollo.io/api/v1/mixed_people/search"
    headers = {
    "accept": "application/json",
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    "x-api-key": apollo_key
}


    # 2. Build payload
    payload = {
        "page": req.get("page", 1),
        "per_page": req.get("per_page", 20),
    }
    if req.get("currentCompany"):
        payload["q_organization_keywords"] = req["currentCompany"]
    if req.get("job_title"):
        payload["person_titles"] = req["job_title"]
    if req.get("location"):
        payload["person_locations"] = req["location"]
    if req.get("keywords"):
        payload["q_keywords"] = req["keywords"]
    if req.get("industry"):
        payload["industry_tag_ids"] = req["industry"]

    max_retries = 3
    backoff = 2

    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(max_retries):
            try:
                response = await client.post(url, headers=headers, json=payload)

                if response.status_code == 429:
                    logging.warning(f"Apollo rate limit, attempt {attempt + 1}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(backoff ** attempt)
                        continue
                    raise HTTPException(status_code=429, detail="Apollo rate limit exceeded.")

                if response.status_code == 422:
                    err = response.json().get("message") or response.text
                    raise HTTPException(status_code=422, detail=f"Apollo error: {err}")

                response.raise_for_status()
                return {
                    "message": "Apollo lead scrape triggered",
                    "apollo_response": response.json()
                }

            except httpx.RequestError as e:
                logging.error(f"Apollo request error: {e}")
                if attempt == max_retries - 1:
                    raise HTTPException(status_code=500, detail=f"Apollo request error: {e}")
                await asyncio.sleep(backoff ** attempt)


@router.post("/assign-to-campaign")
async def assign_leads_to_campaign(req: dict = Body(...), session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    lead_ids = req.get("leadIds", [])
    campaign_id = req.get("campaignId")
    if not lead_ids or not campaign_id:
        raise HTTPException(status_code=400, detail="leadIds and campaignId are required")
    # Check campaign ownership
    campaign_result = await session.execute(select(Campaign).where(Campaign.id == campaign_id, Campaign.user_id == user.id))
    campaign = campaign_result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    # Assign leads
    leads_result = await session.execute(select(Lead).where(Lead.id.in_(lead_ids), Lead.campaign_id == None))
    leads = leads_result.scalars().all()
    for lead in leads:
        old_campaign_id = lead.campaign_id
        lead.campaign_id = campaign_id
        session.add(LeadHistory(
            lead_id=lead.id,
            user_id=user.id,
            action="assigned",
            field="campaign_id",
            old_value=str(old_campaign_id) if old_campaign_id else None,
            new_value=str(campaign_id)
        ))
    try:
        await session.commit()
        logger.info(f"User {user.id} assigned {len(leads)} leads to campaign {campaign_id}")
    except Exception as e:
        logger.error(f"User {user.id} failed to assign leads to campaign {campaign_id}: {str(e)}")
        raise
    # Notification trigger for lead assignment
    if leads:
        from models import Notification
        notification = Notification(
            user_id=user.id,
            type="lead_assigned",
            message=f"{len(leads)} leads assigned to campaign '{campaign.name}'.",
            created_at=datetime.utcnow()
        )
        session.add(notification)
        await session.commit()
    return {"message": f"Assigned {len(leads)} leads to campaign"}

@router.post("/bulk-update")
async def bulk_update_leads(
    req: dict = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    lead_ids = req.get("leadIds", [])
    updates = req.get("updates", {})
    if not lead_ids or not updates:
        raise HTTPException(status_code=400, detail="leadIds and updates are required")
    result = await session.execute(select(Lead).join(Campaign).where(Lead.id.in_(lead_ids), Campaign.user_id == user.id))
    leads = result.scalars().all()
    for lead in leads:
        for k, v in updates.items():
            if hasattr(lead, k):
                setattr(lead, k, v)
        session.add(lead)
    try:
        await session.commit()
        logger.info(f"User {user.id} performed bulk update on leads: {lead_ids}")
    except Exception as e:
        logger.error(f"User {user.id} failed bulk update on leads: {lead_ids}, error: {str(e)}")
        raise
    return {"message": f"Updated {len(leads)} leads"}

@router.post("/bulk-delete")
async def bulk_delete_leads(
    req: dict = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    lead_ids = req.get("leadIds", [])
    if not lead_ids:
        raise HTTPException(status_code=400, detail="leadIds are required")
    result = await session.execute(select(Lead).join(Campaign).where(Lead.id.in_(lead_ids), Campaign.user_id == user.id))
    leads = result.scalars().all()
    for lead in leads:
        await session.delete(lead)
    try:
        await session.commit()
        logger.info(f"User {user.id} performed bulk delete on leads: {lead_ids}")
    except Exception as e:
        logger.error(f"User {user.id} failed bulk delete on leads: {lead_ids}, error: {str(e)}")
        raise
    return {"message": f"Deleted {len(leads)} leads"}


@router.post("/bulk-enrich")
async def bulk_enrich_leads(
    req: dict = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    if not check_enrich_rate_limit(user.id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded: max 10 enrichment requests per minute.")
    lead_ids = req.get("leadIds", [])
    if not lead_ids:
        raise HTTPException(status_code=400, detail="leadIds are required")
    result = await session.execute(select(Lead).join(Campaign).where(Lead.id.in_(lead_ids), Campaign.user_id == user.id))
    leads = result.scalars().all()
    enriched = []
    failed = []
    for lead in leads:
        try:
            req_obj = {"leadId": lead.id}
            resp = await apollo_enrich_lead_email(req_obj, session, user)
            if resp.get("email"):
                enriched.append(lead.id)
            else:
                failed.append(lead.id)
        except Exception as e:
            failed.append(lead.id)
    try:
        await session.commit()
        logger.info(f"User {user.id} performed bulk enrichment on leads: {lead_ids}")
    except Exception as e:
        logger.error(f"User {user.id} failed bulk enrichment on leads: {lead_ids}, error: {str(e)}")
        raise
    return {"enriched": enriched, "failed": failed, "message": f"Bulk enrichment complete: {len(enriched)} enriched, {len(failed)} failed."}
# Apollo enrichment logic
async def apollo_enrich_lead_email(req: dict, session: AsyncSession, user: User):
    lead_id = req.get("leadId")
    if not lead_id:
        raise HTTPException(status_code=400, detail="leadId required")
    lead_result = await session.execute(select(Lead).where(Lead.id == lead_id))
    lead = lead_result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    apollo_key = getattr(user, "apollo_api_key", None) or os.getenv("APOLLO_API_KEY")
    if not apollo_key:
        raise HTTPException(status_code=400, detail="Apollo API key not configured.")
    url = "https://api.apollo.io/v1/people/match"
    headers = {
        "accept": "application/json",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "x-api-key": apollo_key
    }
    payload = {
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "organization_name": lead.company,
        "title": lead.job_title
    }
    max_retries = 3
    backoff = 2
    import httpx, asyncio
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 429:
                if attempt < max_retries - 1:
                    await asyncio.sleep(backoff ** attempt)
                    continue
                raise HTTPException(status_code=429, detail="Apollo rate limit exceeded.")
            resp.raise_for_status()
            data = resp.json()
            email = data.get("person", {}).get("email")
            confidence = data.get("person", {}).get("email_confidence")
            if email:
                lead.email = email
                lead.email_confidence = confidence
                session.add(lead)
                await session.commit()
            return {"email": email, "confidence": confidence, "apollo_response": data}
        except httpx.RequestError as e:
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail=f"Apollo request error: {e}")
            await asyncio.sleep(backoff ** attempt)
        except Exception as e:
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail=f"Apollo enrichment error: {e}")
            await asyncio.sleep(backoff ** attempt)

@router.get("/export")
async def export_leads(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    unassigned: bool = False,
    batch_id: int | None = None,
):
    query = (
        select(Lead)
        .join(Campaign, isouter=True)
        .join(LeadBatch, Lead.batch_id == LeadBatch.id, isouter=True)
        .where(or_(Campaign.user_id == user.id, LeadBatch.user_id == user.id))
    )
    if unassigned:
        query = query.where(Lead.campaign_id == None)
    if batch_id:
        query = query.where(Lead.batch_id == batch_id)
    result = await session.execute(query)
    leads = result.scalars().all()
    # Prepare CSV
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["First Name", "Last Name", "Job Title", "Company", "Profile URL", "Status", "Email", "Email Confidence"])
    for lead in leads:
        writer.writerow([
            lead.first_name,
            lead.last_name,
            lead.job_title,
            lead.company,
            lead.profile_url,
            lead.status,
            getattr(lead, "email", ""),
            getattr(lead, "email_confidence", "")
        ])
    output.seek(0)
    return StreamingResponse(output, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=leads.csv"})

@router.get("/{lead_id}/history")
async def get_lead_history(lead_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    # Only allow access to leads owned by user (campaign or batch)
    result = await session.execute(
        select(Lead)
        .join(Campaign, isouter=True)
        .join(LeadBatch, Lead.batch_id == LeadBatch.id, isouter=True)
        .where(Lead.id == lead_id)
        .where(or_(Campaign.user_id == user.id, LeadBatch.user_id == user.id))
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    history_result = await session.execute(select(LeadHistory).where(LeadHistory.lead_id == lead_id).order_by(LeadHistory.timestamp.desc()))
    history = history_result.scalars().all()
    return [{
        "action": h.action,
        "field": h.field,
        "old_value": h.old_value,
        "new_value": h.new_value,
        "timestamp": h.timestamp
    } for h in history]

logger = logging.getLogger("lead_actions") 

@router.get("/batches")
async def list_batches(session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    from models import LeadBatch
    result = await session.execute(select(LeadBatch).where(LeadBatch.user_id == user.id))
    batches = result.scalars().all()
    return {"batches": [{"id": b.id, "name": b.name, "created_at": b.created_at.isoformat()} for b in batches]}

@router.get("/batches-stats")
async def list_batches_stats(session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    # Return batches with lead counts for this user
    from models import LeadBatch
    batch_rows = await session.execute(select(LeadBatch.id, LeadBatch.name, LeadBatch.created_at).where(LeadBatch.user_id == user.id))
    batches = batch_rows.all()
    if not batches:
        return {"batches": []}
    # Sort by created_at desc
    batches_sorted = sorted(batches, key=lambda r: r[2], reverse=True)
    batch_ids = [b[0] for b in batches_sorted]
    counts_rows = await session.execute(
        select(Lead.batch_id, func.count(Lead.id))
        .where(Lead.batch_id.in_(batch_ids))
        .group_by(Lead.batch_id)
    )
    counts_map = {bid: cnt for bid, cnt in counts_rows.all()}
    return {
        "batches": [
            {"id": bid, "name": name, "count": int(counts_map.get(bid, 0)), "created_at": created_at.isoformat()}
            for bid, name, created_at in batches_sorted
        ]
    }
@router.delete("/batches/{batch_id}")
async def delete_batch(
    batch_id: int, 
    session: AsyncSession = Depends(get_session), 
    user: User = Depends(get_current_user)
):
    # Verify batch exists and belongs to user
    batch_result = await session.execute(
        select(LeadBatch).where(LeadBatch.id == batch_id, LeadBatch.user_id == user.id)
    )
    batch = batch_result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get all leads in this batch for history logging
    leads_result = await session.execute(
        select(Lead).where(Lead.batch_id == batch_id)
    )
    leads = leads_result.scalars().all()
    
    # Log deletion in lead history for each lead before deleting
    for lead in leads:
        session.add(LeadHistory(
            lead_id=lead.id,
            user_id=user.id,
            action="batch_deleted",
            field="batch_id",
            old_value=str(batch_id),
            new_value=None
        ))
    
    try:
        # Delete all leads in the batch first (due to foreign key constraints)
        for lead in leads:
            await session.delete(lead)
        
        # Then delete the batch
        await session.delete(batch)
        await session.commit()
        
        logger.info(f"User {user.id} deleted batch {batch_id} with {len(leads)} leads")
        
        # Add notification
        from models import Notification
        notification = Notification(
            user_id=user.id,
            type="batch_deleted",
            message=f"Batch '{batch.name}' and {len(leads)} associated leads have been deleted.",
            created_at=datetime.utcnow()
        )
        session.add(notification)
        await session.commit()
        
    except Exception as e:
        logger.error(f"User {user.id} failed to delete batch {batch_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete batch: {str(e)}")
    
    return {
        "message": f"Batch '{batch.name}' and {len(leads)} associated leads deleted successfully",
        "batch_name": batch.name,
        "leads_deleted": len(leads)
    }