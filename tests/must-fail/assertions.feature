@must-fail
Feature: Assertions that must fail
  Each scenario asserts something that is not true on the test site: its last step must fail with the message its
  description announces, and a hint. The scenarios only read; tests/check-must-fail.js runs them.

  Scenario: A session that is not the account named
    Fails with: Expected the session to be "Owner Test", but it is Member Test (login "member").
    Given I am a logged in user with the "member" user
    Then I should be logged in as "Owner Test"

  Scenario: A login that worked is not refused
    Fails with: Expected the login to be refused with "Invalid user or password", but
    Given I am not logged in
    When I log in with the "member" user
    Then the login should be refused with "Invalid user or password"

  Scenario: An issue the list does not show
    Fails with: Expected to see the issue "Webship test nothing" in the list
    Given I am a logged in user with the "member" user
    When I open the issues of the project "webship-site"
    Then the issue list should show "Webship test nothing"

  Scenario: A status the issue is not in
    Fails with: Expected the status "Closed", but the issue shows "In Progress".
    Given I am a logged in user with the "member" user
    When I open the issue "The greeting script says Helo instead of Hello"
    Then the status of the issue should be "Closed"

  Scenario: A note the issue does not have
    Fails with: Expected to see the note "Webship test nothing"
    Given I am a logged in user with the "member" user
    When I open the issue "The greeting script says Helo instead of Hello"
    Then the issue should show the note "Webship test nothing"

  Scenario: A member who may change the status
    Fails with: Expected no status in the update form of the issue, but the form offers it.
    Given I am a logged in user with the "member" user
    When I open the issue "The greeting script says Helo instead of Hello"
    Then I should not be able to change the status of the issue

  Scenario: A project a member may open
    Fails with: Expected the project Webship site to be refused, but the site answered 200
    Given I am a logged in user with the "member" user
    Then I should be refused the project "webship-site"

  Scenario: An issue the version does not hold
    Fails with: Expected to see the issue "The usage page spells greeting as greting" in the version
    Given I am a logged in user with the "member" user
    When I open the version "Sprint 1" of the project "webship-site"
    Then the version should list the issue "The usage page spells greeting as greting"

  Scenario: A version in another state
    Fails with: Expected the version to be "closed", but it shows "open".
    Given I am a logged in user with the "member" user
    When I open the version "Sprint 1" of the project "webship-site"
    Then the version should be "closed"
