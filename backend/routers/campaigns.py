
from fastapi import APIRouter, Depends, HTTPException, Body, Path, BackgroundTasks
from typing import List
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Campaign, Lead, User, EmailCampaign, EmailLog, FollowUpEmail, FollowUpMessage
from database import get_session, async_session
from auth_utils import get_current_user
from schemas import CampaignStats, EmailCampaignCreate, FollowUpEmailCreate, FollowUpEmailOut
from datetime import datetime, timedelta 
import os
import logging
import asyncio
from schemas import CampaignCreate, FollowUpMessageCreate

from sqlalchemy.exc import NoResultFound

router = APIRouter(prefix="/api", tags=["campaigns"])

@router.post("/email-campaigns/{campaign_id}/followups", response_model=FollowUpEmailOut)
async def create_followup_email(
    campaign_id: int,
    req: FollowUpEmailCreate = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    # Ensure campaign exists and belongs to user
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")
    followup = FollowUpEmail(
        email_campaign_id=campaign_id,
        subject=req.subject,
        body=req.body,
        delay_days=req.delay_days,
        status="pending"
    )
    session.add(followup)
    await session.commit()
    await session.refresh(followup)
    return followup

@router.get("/email-campaigns/{campaign_id}/followups", response_model=List[FollowUpEmailOut])
async def list_followup_emails(
    campaign_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    # Ensure campaign exists and belongs to user
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")
    result = await session.execute(select(FollowUpEmail).where(FollowUpEmail.email_campaign_id == campaign_id))
    followups = result.scalars().all()
    return followups

@router.put("/email-campaigns/{campaign_id}/followups/{followup_id}", response_model=FollowUpEmailOut)
async def update_followup_email(
    campaign_id: int,
    followup_id: int,
    req: FollowUpEmailCreate = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    # Ensure campaign exists and belongs to user
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")
    result = await session.execute(select(FollowUpEmail).where(FollowUpEmail.id == followup_id, FollowUpEmail.email_campaign_id == campaign_id))
    followup = result.scalar_one_or_none()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up email not found")
    followup.subject = req.subject
    followup.body = req.body
    followup.delay_days = req.delay_days
    session.add(followup)
    await session.commit()
    await session.refresh(followup)
    return followup

@router.delete("/email-campaigns/{campaign_id}/followups/{followup_id}")
async def delete_followup_email(
    campaign_id: int,
    followup_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    # Ensure campaign exists and belongs to user
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")
    result = await session.execute(select(FollowUpEmail).where(FollowUpEmail.id == followup_id, FollowUpEmail.email_campaign_id == campaign_id))
    followup = result.scalar_one_or_none()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up email not found")
    await session.delete(followup)
    await session.commit()
    return {"message": "Follow-up email deleted"}



@router.get("/email-campaigns/performance")
async def email_campaign_performance(session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    # Aggregate sent and responses per day for user's campaigns
    result = await session.execute(
        select(Lead)
        .join(Campaign)
        .where(Campaign.user_id == user.id)
    )
    leads = result.scalars().all()
    # Group by date
    performance = {}
    for lead in leads:
        # Use sent_date or created_at as the date
        date = None
        if hasattr(lead, "sent_date") and lead.sent_date:
            date = lead.sent_date.date().isoformat()
        elif hasattr(lead, "created_at") and lead.created_at:
            date = lead.created_at.date().isoformat()
        else:
            continue
        if date not in performance:
            performance[date] = {"sent": 0, "responses": 0}
        if lead.status in ["contacted", "sent"]:
            performance[date]["sent"] += 1
        if lead.status == "replied":
            performance[date]["responses"] += 1
    # Convert to sorted list
    chart_data = [
        {"date": date, "sent": perf["sent"], "responses": perf["responses"]}
        for date, perf in sorted(performance.items())
    ]
    return chart_data






@router.post("/email-campaigns")
async def create_email_campaign(
    req: EmailCampaignCreate = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    campaign = EmailCampaign(
        user_id=user.id,
        name=req.name,
        subject=req.subject,
        body=req.body,
        status="draft"
    )
    session.add(campaign)
    await session.commit()
    await session.refresh(campaign)

    # Store follow-up emails if provided
    followups = []
    if req.follow_ups:
        for fu in req.follow_ups:
            followup = FollowUpEmail(
                email_campaign_id=campaign.id,
                subject=fu.subject,
                body=fu.body,
                delay_days=fu.delay_days,
                status="pending"
            )
            session.add(followup)
            followups.append(followup)
        await session.commit()

    return {"id": campaign.id, "message": "Email campaign created", "followups": [f.id for f in followups]}

@router.get("/email-campaigns")
async def list_email_campaigns(session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.user_id == user.id))
    campaigns = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "subject": c.subject,
            "body": c.body,
            "status": c.status,
            "scheduled_at": c.scheduled_at,
            "created_at": c.created_at
        } for c in campaigns
    ]

@router.post("/email-campaigns/{campaign_id}/send")
async def send_email_campaign(
    campaign_id: int,
    req: dict = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    """
    Send an email campaign to leads using Apollo.io API.
    req["leadIds"]: list of lead IDs
    req["personalization"]: {leadId: {var: value}}
    """

    # Make sure user has Apollo API key
    APOLLO_API_KEY = user.apollo_api_key
    if not APOLLO_API_KEY:
        raise HTTPException(status_code=500, detail="Apollo API key missing for this user")

    # Fetch campaign
    result = await session.execute(
        select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")

    # Fetch leads
    leads_result = await session.execute(select(Lead).where(Lead.id.in_(req["leadIds"])))
    leads = leads_result.scalars().all()

    logs = []
    failed_count = 0

    for lead in leads:
        # Personalize subject/body
        vars = req.get("personalization", {}).get(str(lead.id), {})
        subject = campaign.subject.format(**vars)
        body = campaign.body.format(**vars)

        # Validate email
        to_email = getattr(lead, "email", None)
        if not to_email or "@" not in to_email:
            status = "failed"
            error = "Missing or invalid email address"
            failed_count += 1
            log = EmailLog(
                campaign_id=campaign.id,
                lead_id=lead.id,
                to_email=to_email or "",
                status=status,
                sent_at=datetime.utcnow(),
                error=error
            )
            session.add(log)
            logs.append(log)
            continue

        # Apollo API request
        data = {
            "to": to_email,
            "subject": subject,
            "body": body
        }

        headers = {
            "Authorization": f"Bearer {APOLLO_API_KEY}",
            "Content-Type": "application/json"
        }

        import httpx
        max_retries = 3
        backoff = 2
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        "https://api.apollo.io/v1/email/send",
                        json=data,
                        headers=headers
                    )
                if resp.status_code == 429:
                    logging.warning(f"Apollo rate limit hit for user {user.id}, lead {lead.id}. Attempt {attempt+1}/{max_retries}.")
                    status = "failed"
                    error = "Apollo rate limit exceeded"
                    failed_count += 1
                    if attempt < max_retries - 1:
                        await asyncio.sleep(backoff ** attempt)
                        continue
                    break
                status = "sent" if resp.status_code in [200, 201] else "failed"
                error = None if status == "sent" else resp.text
                if status == "sent" or attempt == max_retries - 1:
                    break
            except httpx.RequestError as e:
                status = "failed"
                error = str(e)
                logging.error(f"Apollo request error for user {user.id}, lead {lead.id}: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(backoff ** attempt)
                    continue
                failed_count += 1
            except Exception as e:
                status = "failed"
                error = str(e)
                logging.error(f"Unexpected error for user {user.id}, lead {lead.id}: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(backoff ** attempt)
                    continue
                failed_count += 1

        log = EmailLog(
            campaign_id=campaign.id,
            lead_id=lead.id,
            to_email=to_email,
            status=status,
            sent_at=datetime.utcnow(),
            error=error
        )
        session.add(log)
        logs.append(log)

    await session.commit()

    # Schedule follow-up emails for each lead
    # Fetch follow-ups for this campaign
    followups_result = await session.execute(select(FollowUpEmail).where(FollowUpEmail.email_campaign_id == campaign.id))
    followups = followups_result.scalars().all()
    now = datetime.utcnow()
    for lead in leads:
        last_scheduled = now
        for fu in followups:
            scheduled_time = last_scheduled + timedelta(days=fu.delay_days)
            # Create a new FollowUpEmail record for this lead (if you want per-lead tracking, otherwise just set scheduled_at)
            fu_instance = FollowUpEmail(
                email_campaign_id=campaign.id,
                subject=fu.subject,
                body=fu.body,
                delay_days=fu.delay_days,
                scheduled_at=scheduled_time,
                status="scheduled"
            )
            session.add(fu_instance)
            last_scheduled = scheduled_time
    await session.commit()

    # Notify user if any emails failed
    if failed_count > 0:
        from models import Notification
        notification = Notification(
            user_id=user.id,
            type="email_failed",
            message=f"{failed_count} emails failed to send in campaign '{campaign.name}'.",
            created_at=datetime.utcnow()
        )
        session.add(notification)
        await session.commit()

    return {
        "message": f"Sent {len(logs)} emails and scheduled follow-ups for {len(leads)} leads.",
        "results": [{"lead_id": l.lead_id, "status": l.status, "error": l.error} for l in logs]
    }
@router.get("/email-campaigns/{campaign_id}/logs")
async def get_email_campaign_logs(campaign_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")
    logs_result = await session.execute(select(EmailLog).where(EmailLog.campaign_id == campaign_id))
    logs = logs_result.scalars().all()
    # Fetch lead info for each log
    lead_ids = [log.lead_id for log in logs]
    leads_result = await session.execute(select(Lead).where(Lead.id.in_(lead_ids)))
    leads = {lead.id: lead for lead in leads_result.scalars().all()}
    return [
        {
            "lead_id": log.lead_id,
            "lead_name": f"{leads[log.lead_id].first_name} {leads[log.lead_id].last_name}" if log.lead_id in leads else None,
            "to_email": log.to_email,
            "status": log.status,
            "sent_at": log.sent_at,
            "opened_at": log.opened_at,
            "error": log.error
        }
        for log in logs
    ]


# PUT endpoint for editing drafted email campaigns
@router.put("/email-campaigns/{campaign_id}")
async def update_email_campaign(
    campaign_id: int = Path(...),
    req: dict = Body(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")
    # Allow status change and field updates
    if "name" in req:
        campaign.name = req["name"]
    if "subject" in req:
        campaign.subject = req["subject"]
    if "body" in req:
        campaign.body = req["body"]
    if "status" in req:
        allowed_statuses = ["draft", "active", "paused", "completed"]
        new_status = req["status"]
        if new_status not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid status")
        # Only allow certain transitions for MVP
        if campaign.status == "draft" and new_status == "active":
            campaign.status = new_status
        elif campaign.status in ["active", "paused"] and new_status in ["paused", "active", "completed"]:
            campaign.status = new_status
        elif campaign.status == new_status:
            pass  # No change
        else:
            raise HTTPException(status_code=400, detail="Invalid status transition")
    session.add(campaign)
    await session.commit()
    await session.refresh(campaign)
    return {"id": campaign.id, "message": "Email campaign updated", "status": campaign.status}

# DELETE endpoint for deleting drafted email campaigns
@router.delete("/email-campaigns/{campaign_id}")
async def delete_email_campaign(
    campaign_id: int = Path(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
):
    result = await session.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id, EmailCampaign.user_id == user.id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Email campaign not found")
    await session.delete(campaign)
    await session.commit()
    return {"message": "Email campaign deleted"}

@router.get("/campaigns/stats")
async def get_campaign_stats(session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    # Example: return total campaigns for the user
    result = await session.execute(select(Campaign).where(Campaign.user_id == user.id))
    campaigns = result.scalars().all()
    return {
        "total_campaigns": len(campaigns),
        # Add more stats as needed
    }