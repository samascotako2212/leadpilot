from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from auth import router as auth_router
from routers import leads_router, campaigns_router, logs_router, ai_router, activity_router, subscriptions_router
from routers.notifications import router as notifications_router
from database import engine
from models import SQLModel

app = FastAPI()

# CORS for local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create database tables
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

# Include routers with /api prefix to match frontend expectations
app.include_router(auth_router, prefix="")
app.include_router(leads_router, prefix="")
app.include_router(campaigns_router, prefix="")
app.include_router(logs_router, prefix="")
app.include_router(ai_router, prefix="")
app.include_router(activity_router, prefix="")

app.include_router(subscriptions_router, prefix="")
app.include_router(notifications_router)

@app.get("/")
def root():
    return {"message": "LeadPilot Backend API"}
