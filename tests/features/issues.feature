@issues
Feature: Issues
  A member reads the list, opens an issue, moves it through the workflow, adds a note to it, logs time on it and
  assigns it; a new one is made through the form. What a scenario makes is removed after it.

  Background:
    Given I am a logged in user with the "member" user

  Scenario: The list shows an issue, and leaves it once it is closed
    Given there is an issue "Webship test list" in the project "webship-site"
    When I open the issues of the project "webship-site"
    Then the issue list should show "Webship test list"
    When I open the issue "Webship test list"
    And I set the status of the issue to "Closed"
    Then the status of the issue should be "Closed"
    When I open the issues of the project "webship-site"
    Then the issue list should not show "Webship test list"

  Scenario: A note, the time spent and the assignee of an issue
    Given there is an issue "Webship test work" in the project "webship-site"
    When I open the issue "Webship test work"
    And I set the status of the issue to "In Progress"
    And I add the note "Checked on the test site" to the issue
    And I log "0.5" hours on the issue with the comment "Read the issue"
    And I assign the issue to "Member Test"
    Then the status of the issue should be "In Progress"
    And the issue should show the note "Checked on the test site" by "Member Test"
    And the time spent on the issue should be "0:30 h"
    And the issue should be assigned to "Member Test"

  Scenario: An issue made through the form
    Given there is no issue "Webship test new" in the project "webship-site"
    When I create an issue "Webship test new" in the project "webship-site"
    Then the status of the issue should be "New"
    When I open the issues of the project "webship-site"
    Then the issue list should show "Webship test new"
