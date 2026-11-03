"""
soup.startup - what a process checks before building the engine and the
Flask app (app.py, tests/e2e_server.py). Imports neither Flask nor the
rest of the host: it must run even when those libraries are broken.
"""
