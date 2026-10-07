"""Accounts and sessions for Campus Customs.

Passwords are never stored, logged, or returned by the API. What goes in the
`users` table is a PBKDF2-HMAC-SHA256 derivation with a per-user random salt,
in the same format the seeded test user already uses:

    pbkdf2_sha256$<salt>$<64 hex chars>

Session tokens get the same treatment: the browser holds the token, the
database holds only its SHA-256, so a dump of the `sessions` table cannot be
replayed as a login.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

ALGORITHM = "pbkdf2_sha256"

# Matches the iteration count used to seed test@campuscustoms.yale.edu, so the
# provided account keeps working against the same verify path as new accounts.
ITERATIONS = 120_000
SALT_BYTES = 8
SESSION_DAYS = 14
MIN_PASSWORD_LENGTH = 8

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Columns that are safe to hand to the front end. password_hash is not one.
PUBLIC_USER_FIELDS = ("id", "name", "email", "first_name", "last_name", "created_at")


class AuthError(Exception):
    def __init__(self, message: str, status: int = 400, field: str | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.field = field


# --------------------------------------------------------------------------
# password hashing
# --------------------------------------------------------------------------


def _derive(password: str, salt: str, iterations: int = ITERATIONS) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations
    ).hex()


def hash_password(password: str) -> str:
    """Return a storable hash. The salt is fresh for every user, so two people
    with the same password end up with different rows and a precomputed
    rainbow table is worthless."""
    salt = secrets.token_hex(SALT_BYTES)
    return f"{ALGORITHM}${salt}${_derive(password, salt)}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check against a stored hash. Returns False rather than
    raising on malformed input so a corrupt row cannot be told apart from a
    wrong password by timing or by error message."""
    try:
        algorithm, salt, expected = stored.split("$")
    except (AttributeError, ValueError):
        return False
    if algorithm != ALGORITHM:
        return False
    return hmac.compare_digest(_derive(password, salt), expected)


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------


def clean_signup(payload: dict[str, Any]) -> dict[str, str]:
    first = str(payload.get("first_name") or "").strip()
    last = str(payload.get("last_name") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    confirm = str(payload.get("confirm_password") or "")

    if not first:
        raise AuthError("First name is required.", 422, "first_name")
    if not last:
        raise AuthError("Last name is required.", 422, "last_name")
    if not EMAIL_RE.match(email):
        raise AuthError("Enter a valid email address.", 422, "email")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AuthError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", 422, "password"
        )
    if confirm and confirm != password:
        raise AuthError("The two passwords do not match.", 422, "confirm_password")

    return {"first_name": first, "last_name": last, "email": email, "password": password}


# --------------------------------------------------------------------------
# users
# --------------------------------------------------------------------------


def public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in PUBLIC_USER_FIELDS if k in row.keys()}


def find_by_email(conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM users WHERE lower(email) = ?", (email.strip().lower(),)
    ).fetchone()


def create_user(conn: sqlite3.Connection, data: dict[str, str]) -> sqlite3.Row:
    if find_by_email(conn, data["email"]) is not None:
        raise AuthError("An account with that email already exists.", 409, "email")

    full_name = f"{data['first_name']} {data['last_name']}".strip()
    try:
        cur = conn.execute(
            """INSERT INTO users (name, email, password_hash, first_name, last_name)
               VALUES (?, ?, ?, ?, ?)""",
            (
                full_name,
                data["email"],
                hash_password(data["password"]),
                data["first_name"],
                data["last_name"],
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        # UNIQUE(email) lost a race with a simultaneous signup.
        raise AuthError("An account with that email already exists.", 409, "email")

    return conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()


def authenticate(conn: sqlite3.Connection, email: str, password: str) -> sqlite3.Row:
    row = find_by_email(conn, email)

    # Run the KDF even when the email is unknown. Otherwise a missing account
    # returns noticeably faster than a wrong password and the response time
    # leaks which emails are registered.
    stored = row["password_hash"] if row else f"{ALGORITHM}$decoy${'0' * 64}"
    ok = verify_password(password, stored)

    if row is None or not ok:
        raise AuthError("Email or password is incorrect.", 401)
    return row


# --------------------------------------------------------------------------
# sessions
# --------------------------------------------------------------------------


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS sessions (
               token_hash TEXT PRIMARY KEY,
               user_id INTEGER NOT NULL,
               created_at TEXT NOT NULL DEFAULT (datetime('now')),
               expires_at TEXT NOT NULL,
               FOREIGN KEY (user_id) REFERENCES users(id)
           )"""
    )
    conn.commit()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def start_session(conn: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (_token_hash(token), user_id, expires.strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    return token


def session_user(conn: sqlite3.Connection, token: str | None) -> sqlite3.Row | None:
    if not token:
        return None
    return conn.execute(
        """SELECT u.* FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > datetime('now')""",
        (_token_hash(token),),
    ).fetchone()


def end_session(conn: sqlite3.Connection, token: str | None) -> None:
    if not token:
        return
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
    conn.commit()
