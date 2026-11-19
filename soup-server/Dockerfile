# Built from the repository root (docker-compose: context ".", dockerfile
# soup-server/Dockerfile) so the image also gets soup-packages/. The
# layout /srv/soup-server + /srv/soup-packages mirrors the repository, so
# Settings finds the bundled packages at its default path.

# Frontend bundles of the packages: the @soup/sdk and app/dist/index.js of
# every package with an app/ part, served by /api/v3/packages/<n>/app/.
FROM node:24.22.0-alpine AS packages

WORKDIR /srv/soup-packages

# Require the workspace lockfile explicitly; a missing file must fail at
# COPY rather than surface as npm ci's generic EUSAGE error.
COPY soup-packages/package.json soup-packages/package-lock.json ./
COPY soup-packages/ .

# RUN npm ci && npm run build:packages && rm -rf node_modules
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline \
    && npm run build:packages \
    && rm -rf node_modules

FROM python:3.12.16-slim

WORKDIR /srv/soup-server

# PM4Py SVG exports invoke the native Graphviz executable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends graphviz \
    && rm -rf /var/lib/apt/lists/*

COPY soup-server/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Check the core environment independently of optional package libraries.
RUN python -c "import neo4j, waitress"

COPY soup-server/ .
COPY --from=packages /srv/soup-packages/ /srv/soup-packages/

# Uploaded package directories may have owner-only permissions on the host.
# Bundled code must remain readable and traversable by the runtime user.
RUN chmod -R a+rX /srv/soup-packages

# Building the image installs requirements declared by every bundled package.
# Runtime ZIP packages still require explicit dependency-installation approval.
RUN python -c \
    'from pathlib import Path; from soup.core.packages.dependencies import install_bundled; install_bundled(Path("/srv/soup-packages"), Path("/opt/soup-python"))' \
    && if [ -d /opt/soup-python ]; then chmod -R a+rX /opt/soup-python; fi

# The server runs as an unprivileged user with the UID/GID of the
# "memgraph" user of the Memgraph image of docker-compose.yaml, so the
# files one writes in the shared soup-volume (/soup) are readable and
# writable by the other. Read from the image, not guessed:
#   docker run --rm --entrypoint id memgraph/memgraph:3.13.2 memgraph
#   uid=101(memgraph) gid=103(memgraph)
# Check them again when the Memgraph tag changes.
ARG SOUP_UID=101
ARG SOUP_GID=103
RUN groupadd --gid "${SOUP_GID}" soup \
    && useradd --uid "${SOUP_UID}" --gid "${SOUP_GID}" --no-create-home --shell /usr/sbin/nologin soup \
    && mkdir -p /soup /data/soup-packages \
    && chown soup:soup /soup /data/soup-packages

# Packages installed at runtime (and their enabled/disabled state) live in
# a volume, so they survive a rebuild of the image.
ENV SOUP_INSTALLED_PACKAGES_DIR=/data/soup-packages
VOLUME /data/soup-packages

USER soup

# waitress (wsgi.py), one process with several threads: the engine keeps
# its state in memory. app.py (the Flask development server) is for local
# development only.
CMD ["python", "-u", "wsgi.py"]
