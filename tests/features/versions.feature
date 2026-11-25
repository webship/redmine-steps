@versions
Feature: The versions and the roadmap
  The sample project's version lists the issue planned in it, and the roadmap lists the version.

  Scenario: A version and the roadmap
    Given I am a logged in user with the "member" user
    When I open the version "Sprint 1" of the project "webship-site"
    Then the version should be "open"
    And the version should list the issue "The greeting script says Helo instead of Hello"
    And the version should not list the issue "The usage page spells greeting as greting"
    When I open the roadmap of the project "webship-site"
    Then the roadmap should list the version "Sprint 1"
