import os
import logging
from logging.handlers import TimedRotatingFileHandler
from flask import request, g, has_request_context

class RequestContextFilter(logging.Filter):
    """Automatically attaches user_id, session_id, and IP to EVERY log record in the app."""
    def filter(self, record):
        if has_request_context():
            record.user_id = getattr(g, 'user_id', 'ANONYMOUS')
            record.session_id = request.headers.get('X-Session-ID', 'NO_SESSION')
            record.remote_addr = getattr(request, 'remote_addr', 'N/A')
        else:
            record.user_id = getattr(record, 'user_id', 'SYSTEM')
            record.session_id = getattr(record, 'session_id', 'N/A')
            record.remote_addr = getattr(record, 'remote_addr', 'N/A')
        return True

def setup_central_logger(app):
    # Log format matching Vikram sir's requirements
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [User:%(user_id)s] [Session:%(session_id)s] [%(name)s] - %(message)s'
    )

    # Ensure logs directory exists
    os.makedirs('logs', exist_ok=True)

    # 10-Day Rotation / Dumping (Deletes log files older than 10 days)
    file_handler = TimedRotatingFileHandler(
        'logs/tradeiq.log', 
        when='midnight', 
        interval=1, 
        backupCount=10
    )
    file_handler.setFormatter(formatter)
    
    # Stream Handler for stdout / console printing
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    # Apply filter and handlers to root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Apply global context filter
    context_filter = RequestContextFilter()
    root_logger.addFilter(context_filter)

    # Avoid duplicate handlers if app restarts or re-initializes
    if not any(isinstance(h, TimedRotatingFileHandler) for h in root_logger.handlers):
        root_logger.addHandler(file_handler)
    
    if not any(isinstance(h, logging.StreamHandler) for h in root_logger.handlers):
        root_logger.addHandler(console_handler)