#!/usr/bin/env bash
# Build the test site of this pack in a DDEV project: Redmine from the official image on the project's own PostgreSQL,
# its default data in English and its REST API on, the accounts of the suite as members of the project "Webship site",
# and the sample content the features read (its issues, its version "Sprint 1" and a note). It is what CI runs; on a
# machine with Docker and DDEV it makes the same site.
#
#   SITE_DIR=<folder>        where the project goes (default: ../redmine-site beside the pack)
#   REDMINE_VERSION=<x.y.z>  the release of the image (default: 7.0.3)
#   COUNTS_ONLY=1            build nothing: print what the site holds, one count a line (a run must leave them)
#
# The site answers at https://redminesteps.ddev.site, the address cucumber.js opens by default. Its first
# administrator's password and its secret key are made for it, in $SITE_DIR/redmine/env, never printed.
set -euo pipefail

PACK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_DIR="${SITE_DIR:-${PACK}/../redmine-site}"
NAME=redminesteps
VERSION="${REDMINE_VERSION:-7.0.3}"
PASSWORD='dD.123123ddd'

# The site's own Rails runner, in Redmine's container, as its own user, its log to its file; what is piped in reaches it.
runner() {
  ( cd "${SITE_DIR}" && ddev exec -s redmine "gosu redmine bash -c 'cd /usr/src/redmine && RAILS_LOG_TO_STDOUT= bundle exec rails runner $*'" )
}

if [ "${COUNTS_ONLY:-}" = 1 ] ; then
  runner /opt/webship/counts.rb < /dev/null | tr -d '\r' | grep -E '^[a-z ]+: [0-9]+$'
  exit 0
fi

mkdir -p "${SITE_DIR}/redmine" "${SITE_DIR}/.ddev"
SITE_DIR="$(cd "${SITE_DIR}" && pwd)"
cd "${SITE_DIR}"
ddev config --project-type=generic --project-name="${NAME}" --database=postgres:17 < /dev/null

cp "${PACK}/site/redmine-site.rb" "${PACK}/site/counts.rb" redmine/
secret() { head -c 96 /dev/urandom | base64 -w0 | tr -dc 'A-Za-z0-9' | head -c "$1" ; }
ADMIN="$(secret 24)"
( umask 077 && cat > redmine/env <<ENVEOF
REDMINE_VERSION=${VERSION}
SECRET_KEY_BASE=$(secret 96)
REDMINE_ADMIN_PASSWORD=${ADMIN}
REDMINE_DB_POSTGRES=db
REDMINE_DB_USERNAME=db
REDMINE_DB_PASSWORD=db
REDMINE_DB_DATABASE=db
ENVEOF
)
printf 'REDMINE_VERSION=%s\n' "${VERSION}" > .ddev/.env
cat > .ddev/docker-compose.redmine.yaml <<'YAMLEOF'
# Redmine: the official image on the project's PostgreSQL, at the project's address; the project's web container keeps
# the mail catcher. The same service as the Webship Workspace's Redmine plugin.
services:
  web:
    environment:
      - HTTP_EXPOSE=8093:80,8025:8025
      - HTTPS_EXPOSE=8457:80,8026:8025
  redmine:
    image: "redmine:${REDMINE_VERSION:-7.0.3}"
    container_name: ddev-${DDEV_SITENAME}-redmine
    labels:
      com.ddev.site-name: ${DDEV_SITENAME}
      com.ddev.approot: ${DDEV_APPROOT}
    restart: "no"
    expose:
      - "3000"
    depends_on:
      - db
    env_file:
      - ${DDEV_APPROOT}/redmine/env
    volumes:
      - redmine_files:/usr/src/redmine/files
      - ${DDEV_APPROOT}/redmine:/opt/webship:ro
    environment:
      VIRTUAL_HOST: ${DDEV_HOSTNAME}
      HTTP_EXPOSE: "80:3000"
      HTTPS_EXPOSE: "443:3000"
volumes:
  redmine_files:
    name: ddev-${DDEV_SITENAME}-redmine-files
YAMLEOF

echo "Starting Redmine ${VERSION}: the first start migrates the database."
ddev start -y < /dev/null
for attempt in $(seq 1 200) ; do
  code="$(ddev exec "curl -s -o /dev/null -m 10 -w '%{http_code}' http://redmine:3000/login" < /dev/null 2>/dev/null | tr -d '\r' | tail -1 || true)"
  [ "${code}" = 200 ] && break
  [ "${attempt}" = 200 ] && { echo "Redmine did not answer (${code:-none})." ; ddev logs -s redmine --tail 60 < /dev/null || true ; exit 1 ; }
  sleep 3
done

# The default data, the REST API, the address of the links and the administrator's password; then the accounts of the
# suite, each a member of Webship site in its role (the stranger in none), and the sample content.
ADMIN="${ADMIN}" python3 -c '
import base64, json, os
print(base64.b64encode(json.dumps({"admin_password": os.environ["ADMIN"], "host": "redminesteps.ddev.site", "protocol": "https"}).encode()).decode())' \
  | runner /opt/webship/redmine-site.rb defaults
python3 - "${PASSWORD}" <<'PYEOF' | runner /opt/webship/redmine-site.rb accounts content list
import base64, json, sys
password = sys.argv[1]
rows = [{'login': login, 'mail': login + '@example.com', 'password': password, 'firstname': login.capitalize(),
         'lastname': 'Test', 'admin': False, 'role': role, 'action': ''}
        for login, role in [('owner', 'Manager'), ('member', 'Developer'), ('reader', 'Reporter'), ('stranger', '')]]
print(base64.b64encode(json.dumps(rows).encode()).decode())
PYEOF

echo "The site: https://${NAME}.ddev.site"
[ -n "${GITHUB_ENV:-}" ] && echo "LAUNCH_URL=https://${NAME}.ddev.site" >> "${GITHUB_ENV}"
exit 0
