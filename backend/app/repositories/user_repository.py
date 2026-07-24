# this is backend\app\repositories\user_repository.py
from app.extensions import db
from app.models import User, PortfolioSetup


def find_user_by_email(email: str) -> User | None:
    return User.query.filter_by(email=email).first()


def create_user(**fields) -> User:
    user = User(**fields)
    db.session.add(user)
    return user


def create_portfolio_setup(**fields) -> PortfolioSetup:
    portfolio = PortfolioSetup(**fields)
    db.session.add(portfolio)
    return portfolio
def is_admin(user_id: str) -> bool:
    """Checks if a user exists and has the admin role."""
    from app.extensions import db  # or your db instance path
    user = db.session.get(User, user_id)
    return bool(user and user.role == "admin")

def save() -> None:
    db.session.commit()