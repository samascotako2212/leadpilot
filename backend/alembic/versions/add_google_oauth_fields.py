"""
Add Google OAuth fields to user table
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_google_oauth_fields'
down_revision = 'c1e3af0fb1df'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('user', sa.Column('google_id', sa.String(), nullable=True))
    op.add_column('user', sa.Column('google_name', sa.String(), nullable=True))
    op.add_column('user', sa.Column('google_avatar', sa.String(), nullable=True))

def downgrade():
    op.drop_column('user', 'google_id')
    op.drop_column('user', 'google_name')
    op.drop_column('user', 'google_avatar')
