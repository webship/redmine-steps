<p align="center"><img src="https://raw.githubusercontent.com/webship/redmine-steps/2.0.x/assets/logo.svg" alt="Redmine logo" width="96"></p>

# redmine-steps

[![Test](https://github.com/webship/redmine-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/redmine-steps/actions/workflows/test.yml)

Cucumber step definitions for testing Redmine, the open-source project management and issue tracking software, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js. The pack covers what a project's work goes through:

- **logging in and out**: an account of the users registry by its handle, the login form, a refused login, who the
  session is, logging out;
- **a project**: opened by its identifier or its name, and refused to an account with no membership;
- **the issue list** of a project, and **one issue**: its status through the workflow, a note, the time spent on it,
  its assignee, each through its update form;
- **a new issue** made through the form;
- **the versions**: what a version holds and its state, and the roadmap;
- **what an account may not do**: a Reporter's status and assignee.

The steps make and remove their test content through the site's own REST API, as a managing account (a Manager): an
issue a scenario makes goes after it, with its notes and the time spent on it, so a run leaves the site as it found it.

No step phrase names the platform: a scenario reads `When I set the status of the issue to "In Progress"` and
`Then the version should list the issue "…"`.

CI builds a real Redmine site with [DDEV](https://ddev.com) on the runner (the official image on the project's own
PostgreSQL, its default data and REST API, the accounts of the suite, the sample content), runs the whole suite
against it twice on every push and pull request, checks after each run that the site holds what it held before, then
runs the assertions that must fail; see [The test site](#the-test-site) and
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## Logging in first

Every scenario starts by logging in, so these are the steps to know first:

| Step | What it does |
| --- | --- |
| `Given I am a logged in user with the "member" user` | Logs in as an account of the users registry, by its handle. The first time in a run through the login form, then its session is put back |
| `When I log in with the "member" user` | Fills and submits the login form with the account's login and password, and asserts nothing: for scenarios about the login itself |
| `When I log in as "member" with the password "wrong"` | The same with a login and a password as typed |
| `Given I am not logged in` | The browser forgets its session |
| `When I log out` | Logs out through the site (its sign-out page and button), and waits until the session is a visitor's |
| `Then I should be logged in as "Member Test"` | The session is the account's: its name as the site shows it, or its login (`"member"`) |
| `Then I should not be logged in` | The session is a visitor's |
| `Then the login should be refused with "Invalid user or password"` | The login form refused the last login with that message (give the scenario `@js-off`: the browser logs the refused request) |

```gherkin
Scenario: An account logs in through the form and out again
  Given I am not logged in
  When I log in with the "member" user
  Then I should be logged in as "Member Test"
  When I log out
  Then I should not be logged in
```

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, python3, and Node.js 24 or later with npm. Redmine and
its database run in DDEV's containers.

**1. The site.** The pack's own build script (the one CI runs) makes the site in a DDEV project: the official image
(`redmine:7.0.3`, `REDMINE_VERSION` for another release) on PostgreSQL 17, its default data in English and its REST API
on, the four accounts of [Test users](#test-users), and the sample content (see [The test site](#the-test-site)). It
takes under a minute once the image is pulled (about 700 MB).

```bash
git clone https://github.com/webship/redmine-steps.git
SITE_DIR="$PWD/redmine-site" redmine-steps/.github/scripts/build-ddev-site.sh
```

The site answers at `https://redminesteps.ddev.site`. In the [Webship Workspace](https://github.com/webship/workspace),
its Redmine plugin builds the same site in a sites folder, on DDEV or on Docker Compose, and wires this pack into the
testing setup of the site:

```bash
bash core/scripts/plugins.sh --require redmine --with-needs
bash core/scripts/plugins.sh --activate redmine --with-needs
bash core/scripts/plugins.sh --install redmine
bash dev/cmd-redmine-project.sh rmsite --install --add-users --sample-content
bash dev/cmd-tools-testing.sh rmsite --run
```

**2. A test project.**

```bash
mkdir redmine-tests && cd redmine-tests
npm init -y
npm install --save-dev webship-js @webship-js/redmine-steps
npx init-webship-js
```

**3. `cucumber.js`.** Add the pack's step definitions after webship-js's own, and give the world its parameters:

```javascript
require: [
  'node_modules/webship-js/tests/step-definitions/**/*.js',
  'node_modules/@webship-js/redmine-steps/tests/step-definitions/**/*.js',
],
tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
worldParameters: {
  launchUrl: process.env.LAUNCH_URL || 'https://redminesteps.ddev.site',
  // The account that makes and removes test content through the site's REST API: a Manager of the projects used.
  manager: process.env.MANAGER || 'owner',
  // The project a step works in when it names none (its identifier).
  project: process.env.PROJECT || 'webship-site',
  users: {
    owner: { username: process.env.REDMINE_OWNER_USER || 'owner', password: process.env.REDMINE_OWNER_PASSWORD, name: 'Owner Test' },
    member: { username: process.env.REDMINE_MEMBER_USER || 'member', password: process.env.REDMINE_MEMBER_PASSWORD, name: 'Member Test' },
    reader: { username: process.env.REDMINE_READER_USER || 'reader', password: process.env.REDMINE_READER_PASSWORD, name: 'Reader Test' },
    stranger: { username: process.env.REDMINE_STRANGER_USER || 'stranger', password: process.env.REDMINE_STRANGER_PASSWORD, name: 'Stranger Test' },
  },
  // … webship-js's own parameters (minWaitTime, screenshot, javascript …)
},
```

This repository's own [`cucumber.js`](cucumber.js) is a whole example.

**4. Run.**

```bash
npx cucumber-js                                      # every feature
npx cucumber-js tests/features/issues.feature        # one feature
CUCUMBER_TAGS=@versions npx cucumber-js              # one tag
```

## Steps

### Projects

| Step | What it does |
| --- | --- |
| `When I open the project "webship-site"` | Opens the project's overview, by its identifier or its name ("Webship site") |
| `Then I should be refused the project "webship-site"` | The session may not open the project: the site answers 403 (`@js-off`) |

### Test content

| Step | What it does |
| --- | --- |
| `Given there is an issue "Webship test …" in the project "webship-site"` | Makes it through the REST API as the managing account (one of the subject left by a stopped run goes first). It goes after the scenario |
| `Given there is no issue "Webship test …" in the project "webship-site"` | Removes any of the subject, with its notes and its time |

The project part is optional in both: the last project the scenario used, else `worldParameters.project`.

### The issue list

| Step | What it does |
| --- | --- |
| `When I open the issues of the project "webship-site"` | The project's list (its default query: the open issues) |
| `Then the issue list should show "…"` / `should not show "…"` | A row of the subject is (not) in the list on screen |
| `When I create an issue "Webship test …" in the project "webship-site"` | Through the form of a new issue (the project's default tracker), created. It goes after the scenario |

### One issue

| Step | What it does |
| --- | --- |
| `When I open the issue "…"` | Opens it by its subject |
| `When I set the status of the issue to "In Progress"` | Through its update form: the statuses the workflow of the account's role allows |
| `Then the status of the issue should be "In Progress"` | The status it shows |
| `When I add the note "…" to the issue` | Through its update form, and waits until its history lists it |
| `Then the issue should show the note "…"` (`… by "Member Test"`) | The history lists the note, written by that account when one is named |
| `When I log "0.5" hours on the issue` (`… with the comment "…"`) | Through its update form, on the site's first activity, for today |
| `Then the time spent on the issue should be "0:30 h"` | The spent time as it shows it |
| `When I assign the issue to "Member Test"` | Through its update form: someone the form lists |
| `Then the issue should be assigned to "Member Test"` | The assignee it shows |

### What an account may not do

| Step | What it does |
| --- | --- |
| `Then I should not be able to change the status of the issue` | Its update form has no status (a Reporter) |
| `Then I should not be able to assign the issue` | Its update form has no assignee (a Reporter) |

### Versions

| Step | What it does |
| --- | --- |
| `When I open the version "Sprint 1" of the project "webship-site"` | The version's own page |
| `Then the version should be "open"` | The state it shows (open, locked, closed) |
| `Then the version should list the issue "…"` / `should not list "…"` | What it holds |
| `When I open the roadmap of the project "webship-site"` | The project's roadmap |
| `Then the roadmap should list the version "Sprint 1"` / `should not list "…"` | The versions on it |

Every step carries five example phrasings in its JSDoc, and `npm run test:examples` checks that each one matches its
own step only.

## Rules of a suite

- Log in by a handle of the users registry; never write a password into a feature.
- Never create or delete an account in a suite: accounts are configuration, made by the build of the site.
- Change only what the scenario made: a status, a note, the time and an assignee go on an issue of
  `Given there is an issue "…"`, which goes after the scenario with all of it. A note stays in the history.
- Name test content "Webship test …". A run that was stopped half way leaves its issues; the Workspace's
  `cmd-tools-redmine-cli.sh <site> --tidy` removes them, or delete them as the managing account.
- A refusal the site answers with an error status (a wrong password, a project an account may not open) makes the
  browser log a failed request: give those scenarios `@js-off`.

## Test users

The accounts the features log in as, each with the password `dD.123123ddd`:

| Handle | Login | Name | Role in Webship site |
| --- | --- | --- | --- |
| `owner` | `owner` | Owner Test | Manager (the managing account) |
| `member` | `member` | Member Test | Developer |
| `reader` | `reader` | Reader Test | Reporter |
| `stranger` | `stranger` | Stranger Test | No membership |

## The test site

`.github/scripts/build-ddev-site.sh` builds it, and `COUNTS_ONLY=1` makes it print what the site holds (issues, notes,
journals, journal details, time entries, versions, members, users, attachments, watchers): CI compares them before and
after each run. The sample content, in the project Webship site (`webship-site`):

- "The greeting script says Helo instead of Hello": a Bug by the owner, In Progress, assigned to Member Test, in the
  version "Sprint 1", with a note;
- "The usage page spells greeting as greting": a Bug by the member, New;
- "An issue opened by someone outside the project": a Feature opened by the stranger.

The features read them and never change them.

## The assertions that must fail

`tests/must-fail/` holds scenarios that assert something that is not true on the test site; `npm run test:must-fail`
runs them and checks that each fails at its last step with the message its description announces, and a hint. A step
that cannot fail proves nothing.

## Logo

The logo is Redmine's, as [Simple Icons](https://simpleicons.org) 16.37.0 ships it (`redmine.svg`), in the colour the
set lists for it, under the licence the set gives it, CC BY-SA 2.5; its source is
https://www.redmine.org/projects/redmine/wiki/logo. It names the platform the pack tests.

## License

MIT (see `LICENSE`).
