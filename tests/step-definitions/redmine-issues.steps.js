'use strict';

// Issue step definitions: the test content a scenario makes and removes (through the site's REST API, as the managing
// account), the issue list, one issue and what a person changes on it through its update form (its status through the
// workflow, a note, the time spent, its assignee), a new issue made through the form, and what an account may not do
// (a Reporter's status and assignee).
//
// What a scenario makes goes after it: the issues a Given step made and the ones a scenario created through the form
// are removed, with their notes and the time spent on them, as the managing account, so a run leaves the site as it
// found it. Name test content "Webship test …": `cmd-tools-redmine-cli.sh <site> --tidy` removes what a stopped run left.

const { Given, When, Then, After, AfterAll } = require('@cucumber/cucumber');
const { smartSettle, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  exactly,
  tidy,
  open,
  actOrExplain,
  assertPresence,
  waitForValue,
  findProject,
  findIssues,
  issueNamed,
  remember,
  removeIssue,
  makeIssue,
  managerContexts,
} = require('./redmine-helpers');

/** The project a step names, else the last one a scenario used, else the one of cucumber.js. */
async function projectOf(world, which) {
  const project = await findProject(world, which || (world.redmine && world.redmine.project));
  world.redmine = Object.assign(world.redmine || {}, { project: project.identifier });
  return project;
}

/** The issue page on screen: its id, from the address, or a friendly error. */
function openIssue(world) {
  const m = world.page.url().match(/\/issues\/(\d+)/);
  if (!m) throw friendly({ message: `No issue is open (the page is ${world.page.url()}).`, hint: 'Open one first with When I open the issue "…".' });
  return m[1];
}

/** An attribute the open issue shows ("status", "assigned-to", "spent-time"), as text; '' when it shows none. */
async function attribute(world, name) {
  return tidy(await world.page.locator(`.issue .${name}.attribute .value`).first().innerText({ timeout: 2000 }).catch(() => ''));
}

/**
 * Change the open issue through its update form ("Edit", then the form's fields, then "Submit"), and wait for the
 * site's answer. `fill` sets the fields; a refused update throws with what the site said.
 */
async function update(world, label, target, fill, hint) {
  const id = openIssue(world);
  await actOrExplain(label, target, async () => {
    await world.page.locator(`a.icon-edit[href$="/issues/${id}/edit"]`).first().click({ timeout: budget(world) });
    await world.page.locator('#update').waitFor({ state: 'visible', timeout: budget(world) });
    await fill(world.page.locator('#issue-form'));
    await world.page.locator('#issue-form [type="submit"][name="commit"]').first().click();
  }, hint);
  const answer = world.page.locator('#flash_notice, #errorExplanation').first();
  await answer.waitFor({ state: 'visible', timeout: budget(world) }).catch(() => {});
  const error = tidy(await world.page.locator('#errorExplanation').first().innerText({ timeout: 500 }).catch(() => ''));
  if (error) throw friendly({ message: `The site refused to ${label} "${target}": ${error}`, hint });
}

// ---------------------------------------------------------------------------
// Test content
// ---------------------------------------------------------------------------

/**
 * Make an issue through the site's REST API as the managing account, in the project's first tracker and default
 * status; one of the subject left by a stopped run goes first. It goes again after the scenario.
 *
 * Example #1: Given there is an issue "Webship test task" in the project "webship-site"
 * Example #2: Given there is an issue "Webship test note" in the project "Webship site"
 * Example #3: And there is an issue "Webship test status"
 * Example #4: Given there is an issue "Webship test time" in the project "webship-site"
 * Example #5: Given there is an issue "Webship test assignee"
 *
 */
Given(/^there is an issue "([^"]*)"(?: in the project "([^"]*)")?$/, async function (subject, which) {
  const project = await projectOf(this, which);
  for (const old of await findIssues(this, project, subject)) await removeIssue(this, old.id);
  await makeIssue(this, project, subject);
});

/**
 * Make sure no issue of the subject is in the project: one there is removed with its notes and its time, as the
 * managing account.
 *
 * Example #1: Given there is no issue "Webship test new" in the project "webship-site"
 * Example #2: Given there is no issue "Webship test new" in the project "Webship site"
 * Example #3: And there is no issue "Webship test task"
 * Example #4: Given there is no issue "Webship test created"
 * Example #5: Then there is no issue "Webship test new" in the project "webship-site"
 *
 */
Given(/^there is no issue "([^"]*)"(?: in the project "([^"]*)")?$/, async function (subject, which) {
  const project = await projectOf(this, which);
  for (const old of await findIssues(this, project, subject)) await removeIssue(this, old.id);
});

// ---------------------------------------------------------------------------
// The list and one issue
// ---------------------------------------------------------------------------

/**
 * Open the issue list of a project (its default query: the open issues).
 *
 * Example #1: When I open the issues of the project "webship-site"
 * Example #2: When I open the issues of the project "Webship site"
 * Example #3: And we open the issues of the project "webship-site"
 * Example #4: Given I open the issues of the project "webship-site"
 * Example #5: When open the issues of the project "Webship site"
 *
 */
When(/^(I |we )*open the issues of the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await projectOf(this, which);
  await open(this, `/projects/${project.identifier}/issues`);
});

/**
 * Assert that the issue list on screen shows (or does not show) a row of the subject.
 *
 * Example #1: Then the issue list should show "Webship test task"
 * Example #2: Then the issue list should not show "Webship test task"
 * Example #3: And the issue list should show "The greeting script says Helo instead of Hello"
 * Example #4: But the issue list should not show "Webship test closed"
 * Example #5: Then the issue list should show "Webship test new"
 *
 */
Then(/^the issue list should (not )?show "([^"]*)"$/, async function (notCase, subject) {
  await assertPresence(this.page.locator('table.issues tr.issue td.subject').filter({ hasText: exactly(subject) }), notCase, {
    label: `the issue "${subject}" in the list`,
    hint: notCase ? 'The list shows the open issues: a closed one leaves it.' : 'The list shows the open issues of the project the session may see; open it first with When I open the issues of the project "…".',
    timeout: budget(this),
  });
});

/**
 * Open an issue by its subject, in the project the scenario works in.
 *
 * Example #1: When I open the issue "Webship test task"
 * Example #2: When I open the issue "The greeting script says Helo instead of Hello"
 * Example #3: And we open the issue "Webship test note"
 * Example #4: Given I open the issue "Webship test status"
 * Example #5: When open the issue "Webship test time"
 *
 */
When(/^(I |we )*open the issue "([^"]*)"$/, async function (pronounCase, subject) {
  const issue = await issueNamed(this, subject);
  await open(this, `/issues/${issue.id}`);
  await assertPresence(this.page.locator('.issue .subject h3').filter({ hasText: subject }), null, {
    label: `the issue "${subject}"`,
    hint: 'The account of the session must see the project of the issue.',
    timeout: budget(this),
  });
});

/**
 * Create an issue through the form of a project (its default tracker), and wait until it is created. It goes again
 * after the scenario.
 *
 * Example #1: When I create an issue "Webship test new" in the project "webship-site"
 * Example #2: When I create an issue "Webship test new" in the project "Webship site"
 * Example #3: And we create an issue "Webship test created"
 * Example #4: When I create an issue "Webship test new"
 * Example #5: Then I create an issue "Webship test created" in the project "webship-site"
 *
 */
When(/^(I |we )*create an issue "([^"]*)"(?: in the project "([^"]*)")?$/, async function (pronounCase, subject, which) {
  const project = await projectOf(this, which);
  await open(this, `/projects/${project.identifier}/issues/new`);
  await actOrExplain('create the issue', subject, async () => {
    await this.page.locator('#issue_subject').waitFor({ state: 'visible', timeout: budget(this) });
    await this.page.locator('#issue_subject').fill(subject);
    await this.page.locator('#issue-form [type="submit"][name="commit"]').first().click();
    await this.page.waitForURL(/\/issues\/\d+(?:$|[?#])/, { timeout: budget(this) });
  }, 'The form of a new issue (its subject, and Create) shows to an account that may add issues in the project.');
  remember(this, openIssue(this));
  await smartSettle(this.page, 1000);
});

// ---------------------------------------------------------------------------
// What a person changes on the open issue
// ---------------------------------------------------------------------------

/**
 * Move the open issue to a status through its update form (the statuses the workflow of the account's role allows).
 *
 * Example #1: When I set the status of the issue to "In Progress"
 * Example #2: When I set the status of the issue to "Closed"
 * Example #3: And we set the status of the issue to "Resolved"
 * Example #4: When I set the status of the issue to "Feedback"
 * Example #5: Then I set the status of the issue to "New"
 *
 */
When(/^(I |we )*set the status of the issue to "([^"]*)"$/, async function (pronounCase, status) {
  await update(this, 'set the status to', status, async (form) => {
    await form.locator('#issue_status_id').selectOption({ label: status }, { timeout: budget(this) });
  }, 'The status list of the update form offers the statuses the workflow allows the account\'s role from the issue\'s status.');
  const result = await waitForValue(() => attribute(this, 'status'), (shown) => exactly(status).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `The status did not become "${status}": it shows "${result.value}".`, hint: 'The site may have refused the move.' });
});

/**
 * Assert the status the open issue shows.
 *
 * Example #1: Then the status of the issue should be "In Progress"
 * Example #2: Then the status of the issue should be "New"
 * Example #3: And the status of the issue should be "Closed"
 * Example #4: But the status of the issue should be "Feedback"
 * Example #5: Then the status of the issue should be "Resolved"
 *
 */
Then(/^the status of the issue should be "([^"]*)"$/, async function (status) {
  openIssue(this);
  const result = await waitForValue(() => attribute(this, 'status'), (shown) => exactly(status).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `Expected the status "${status}", but the issue shows "${result.value}".`, hint: 'The status is among the attributes at the top of the issue.' });
});

/**
 * Add a note to the open issue through its update form, and wait until its history lists it.
 *
 * Example #1: When I add the note "Checked on the test site" to the issue
 * Example #2: When I add the note "Webship test note" to the issue
 * Example #3: And we add the note "Ready for a review" to the issue
 * Example #4: When I add the note "Done" to the issue
 * Example #5: Then I add the note "Webship test reply" to the issue
 *
 */
When(/^(I |we )*add the note "([^"]*)" to the issue$/, async function (pronounCase, text) {
  await update(this, 'add the note', text, async (form) => {
    await form.locator('#issue_notes').fill(text);
  }, 'The update form has a notes box for an account that may add notes to the issue.');
  await assertPresence(this.page.locator('#history .journal.has-notes .wiki').filter({ hasText: text }), null, {
    label: `the note "${text}"`,
    hint: 'The note was sent but is not in the history: the site may have refused it.',
    timeout: budget(this),
  });
});

/**
 * Assert that the history of the open issue lists a note holding the text, written by an account when it names one
 * (its name as the site shows it).
 *
 * Example #1: Then the issue should show the note "Checked on the test site"
 * Example #2: Then the issue should show the note "Checked on the test site" by "Member Test"
 * Example #3: And the issue should show the note "The script is in the project's repository"
 * Example #4: Then the issue should show the note "Ready for a review" by "Owner Test"
 * Example #5: But the issue should show the note "Done"
 *
 */
Then(/^the issue should show the note "([^"]*)"(?: by "([^"]*)")?$/, async function (text, author) {
  openIssue(this);
  const journal = this.page.locator('#history .journal.has-notes').filter({ has: this.page.locator('.wiki', { hasText: text }) });
  await assertPresence(journal, null, { label: `the note "${text}"`, hint: 'The notes are in the history of the issue (open it with When I open the issue "…").', timeout: budget(this) });
  if (!author) return;
  const head = tidy(await journal.first().locator('h4').first().innerText({ timeout: 2000 }).catch(() => ''));
  if (!head.toLowerCase().includes(author.toLowerCase())) throw friendly({ message: `Expected the note "${text}" to be by ${author}, but its heading says "${head}".`, hint: 'Give the name the site shows for the account ("Member Test").' });
});

/**
 * Log time on the open issue through its update form: the hours ("0.5", "1", "1:30"), the site's first activity, and a
 * comment when the step gives one. The day is today.
 *
 * Example #1: When I log "0.5" hours on the issue
 * Example #2: When I log "1" hours on the issue with the comment "Read the code"
 * Example #3: And we log "2" hours on the issue
 * Example #4: When I log "1.25" hours on the issue with the comment "Webship test time"
 * Example #5: Then I log "0.5" hours on the issue
 *
 */
When(/^(I |we )*log "([^"]*)" hours on the issue(?: with the comment "([^"]*)")?$/, async function (pronounCase, hours, comment) {
  await update(this, 'log time', `${hours} hours`, async (form) => {
    await form.locator('#time_entry_hours').fill(hours);
    const activity = form.locator('#time_entry_activity_id');
    if (await activity.count()) {
      const values = await activity.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
      if (values.length && !(await activity.inputValue())) await activity.selectOption(values[0]);
    }
    if (comment) await form.locator('#time_entry_comments').fill(comment);
  }, 'The update form has the spent time for an account that may log time in the project.');
});

/**
 * Assert the time spent on the open issue, as it shows it ("0:30 h", "1:00 h").
 *
 * Example #1: Then the time spent on the issue should be "0:30 h"
 * Example #2: Then the time spent on the issue should be "1:00 h"
 * Example #3: And the time spent on the issue should be "2:00 h"
 * Example #4: But the time spent on the issue should be "1:15 h"
 * Example #5: Then the time spent on the issue should be "0:30 h"
 *
 */
Then(/^the time spent on the issue should be "([^"]*)"$/, async function (spent) {
  openIssue(this);
  const result = await waitForValue(() => attribute(this, 'spent-time'), (shown) => shown.replace(/\s+/g, '') === spent.replace(/\s+/g, ''), budget(this));
  if (!result.ok) throw friendly({ message: `Expected the time spent "${spent}", but the issue shows "${result.value || 'none'}".`, hint: 'The spent time is among the attributes of the issue once time is logged on it, as the site formats it ("0:30 h").' });
});

/**
 * Assign the open issue through its update form, to someone the form lists, by the name the site shows.
 *
 * Example #1: When I assign the issue to "Member Test"
 * Example #2: When I assign the issue to "Owner Test"
 * Example #3: And we assign the issue to "Member Test"
 * Example #4: Then I assign the issue to "Owner Test"
 * Example #5: When assign the issue to "Member Test"
 *
 */
When(/^(I |we )*assign the issue to "([^"]*)"$/, async function (pronounCase, name) {
  await update(this, 'assign the issue to', name, async (form) => {
    await form.locator('#issue_assigned_to_id').selectOption({ label: name }, { timeout: budget(this) });
  }, 'The assignee list of the update form shows to an account that may edit the issue, with the members who take issues.');
  const result = await waitForValue(() => attribute(this, 'assigned-to'), (shown) => exactly(name).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `The issue was not assigned to ${name}: it shows "${result.value}".`, hint: 'Only a member whose role takes issues can be assigned.' });
});

/**
 * Assert who the open issue is assigned to, by the name the site shows.
 *
 * Example #1: Then the issue should be assigned to "Member Test"
 * Example #2: Then the issue should be assigned to "Owner Test"
 * Example #3: And the issue should be assigned to "Member Test"
 * Example #4: But the issue should be assigned to "Owner Test"
 * Example #5: Then the issue should be assigned to "Member Test"
 *
 */
Then(/^the issue should be assigned to "([^"]*)"$/, async function (name) {
  openIssue(this);
  const result = await waitForValue(() => attribute(this, 'assigned-to'), (shown) => exactly(name).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `Expected the issue to be assigned to ${name}, but it shows "${result.value || 'nobody'}".`, hint: 'The assignee is the attribute "Assignee" of the issue.' });
});

// ---------------------------------------------------------------------------
// What an account may not do
// ---------------------------------------------------------------------------

/** The update form of the open issue, opened; null when the issue offers none. */
async function updateForm(world) {
  const id = openIssue(world);
  const edit = world.page.locator(`a.icon-edit[href$="/issues/${id}/edit"]`).first();
  if (!(await edit.count())) return null;
  await edit.click();
  await world.page.locator('#update').waitFor({ state: 'visible', timeout: budget(world) });
  return world.page.locator('#issue-form');
}

/**
 * Assert that the account of the session may not move the open issue: its update form has no status (or there is no
 * update form at all).
 *
 * Example #1: Then I should not be able to change the status of the issue
 * Example #2: Then we should not be able to change the status of the issue
 * Example #3: And I should not be able to change the status of the issue
 * Example #4: But I should not be able to change the status of the issue
 * Example #5: Then should not be able to change the status of the issue
 *
 */
Then(/^(I |we )*should not be able to change the status of the issue$/, async function (pronounCase) {
  const form = await updateForm(this);
  if (form && (await form.locator('#issue_status_id').count())) throw friendly({ message: 'Expected no status in the update form of the issue, but the form offers it.', hint: 'A Reporter may add notes but not move an issue; a Developer and a Manager may.' });
});

/**
 * Assert that the account of the session may not assign the open issue: its update form has no assignee (or there is
 * no update form at all).
 *
 * Example #1: Then I should not be able to assign the issue
 * Example #2: Then we should not be able to assign the issue
 * Example #3: And I should not be able to assign the issue
 * Example #4: But I should not be able to assign the issue
 * Example #5: Then should not be able to assign the issue
 *
 */
Then(/^(I |we )*should not be able to assign the issue$/, async function (pronounCase) {
  const form = await updateForm(this);
  if (form && (await form.locator('#issue_assigned_to_id').count())) throw friendly({ message: 'Expected no assignee in the update form of the issue, but the form offers it.', hint: 'A Reporter may add notes but not assign an issue; a Developer and a Manager may.' });
});

// ---------------------------------------------------------------------------
// What a scenario made goes after it
// ---------------------------------------------------------------------------

After(async function () {
  const made = (this.redmine && this.redmine.made) || new Set();
  for (const id of made) {
    try { await removeIssue(this, id); } catch (e) { console.warn(`  could not remove the issue #${id} a scenario made: ${e.message}`); }
  }
  if (this.redmine) this.redmine.made = new Set();
});

AfterAll(async function () {
  await managerContexts.dispose();
});
