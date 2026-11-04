# Built from the repository root (docker-compose: context ".", dockerfile
# soup-server/Dockerfile) so the image also gets soup-packages/. The
# layout /srv/soup-server + /srv/soup-packages mirrors the repository, so
# Settings finds the bundled packages at its default path.

# Frontend bundles of the packages: the @soup/sdk and app/dist/index.js of
# every package with an app/ part, served by /api/v3/packages/<n>/app/.
FROM node:24.22.0-alpine AS packages

WORKDIR /srv/soup-packages

COPY soup-packages/ .

RUN npm ci && npm run build:packages && rm -rf node_modules

FROM python:3.12.16-slim

WORKDIR /srv/soup-server

COPY soup-server/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# A binary incompatibility (e.g. numpy 2.x under pandas 2.1.1) fails the
# build here instead of the start of the packages.
RUN python -c "import numpy, pandas, neo4j, docker, waitress; print(numpy.__version__, pandas.__version__)"

COPY soup-server/ .
COPY --from=packages /srv/soup-packages/ /srv/soup-packages/

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
