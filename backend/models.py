

from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime

# Follow-up message model for LinkedIn Campaign
class FollowUpMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="campaign.id")
    body: str
    delay_days: int  # Number of days after main message or previous follow-up
    scheduled_at: Optional[datetime] = None  # Calculated when campaign is sent
    status: str = Field(default="pending")  # pending, scheduled, sent, failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    campaign: Optional["Campaign"] = Relationship()

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    # Subscription and API fields
    subscription_tier: str = Field(default="free")
    appollo_api_key: Optional[str] = None
    paystack_customer_id: Optional[str] = None
    subscription_status: str = Field(default="active")  # active, cancelled, expired
    subscription_expires_at: Optional[datetime] = None
    campaigns: List["Campaign"] = Relationship(back_populates="user")

class Campaign(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    name: str
    description: Optional[str] = None
    status: str = Field(default="draft")  # draft, active, paused, completed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user: Optional[User] = Relationship(back_populates="campaigns")
    leads: List["Lead"] = Relationship(back_populates="campaign")

class Lead(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    profile_url: Optional[str] = None
    status: str
    message_text: Optional[str] = None
    email: Optional[str] = Field(default=None, index=True)
    email_confidence: Optional[int] = Field(default=None)
    campaign_id: Optional[int] = Field(default=None, foreign_key="campaign.id", nullable=True)
    campaign: Optional[Campaign] = Relationship(back_populates="leads")
    batch_id: Optional[int] = Field(default=None, foreign_key="leadbatch.id", nullable=True)
    batch: Optional["LeadBatch"] = Relationship(back_populates="leads")
    outreach_logs: List["OutreachLog"] = Relationship(back_populates="lead")
    history: List["LeadHistory"] = Relationship(back_populates="lead",sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class OutreachLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id")
    status: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    lead: Optional[Lead] = Relationship(back_populates="outreach_logs")

class EmailCampaign(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    name: str
    subject: str
    body: str
    status: str = Field(default="draft")  # draft, scheduled, sent
    scheduled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user: Optional[User] = Relationship()
    logs: List["EmailLog"] = Relationship(back_populates="campaign")

class EmailLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="emailcampaign.id")
    lead_id: int = Field(foreign_key="lead.id")
    to_email: str
    status: str  # sent, delivered, opened, bounced, failed
    sent_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    error: Optional[str] = None
    campaign: Optional[EmailCampaign] = Relationship(back_populates="logs")
    lead: Optional[Lead] = Relationship()


# Follow-up email model for EmailCampaign
class FollowUpEmail(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email_campaign_id: int = Field(foreign_key="emailcampaign.id")
    subject: str
    body: str
    delay_days: int  # Number of days after main email or previous follow-up
    scheduled_at: Optional[datetime] = None  # Calculated when campaign is sent
    status: str = Field(default="pending")  # pending, scheduled, sent, failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    email_campaign: Optional[EmailCampaign] = Relationship()


# Internal Notification model
class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    type: str  # e.g. campaign_completed, lead_updated, usage_limit
    message: str
    read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    priority: str = Field(default="info")  # info, warning, error
    expires_at: Optional[datetime] = None
    notification_metadata: Optional[str] = None  # JSON string for extra data (e.g., link, action)
    delivery_status: str = Field(default="delivered")  # delivered, failed
    user: Optional[User] = Relationship()

class LeadHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id",nullable=True)
    user_id: int = Field(foreign_key="user.id")
    action: str  # e.g. created, updated, deleted, enriched, assigned
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow) 
    lead: Optional[Lead] = Relationship(back_populates="history")

class LeadBatch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str  # User-defined batch name
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user: Optional["User"] = Relationship()
    leads: List["Lead"] = Relationship(back_populates="batch")