# frozen_string_literal: true

# What the test site holds, one count a line: a run of the suite must leave each as it found it. Run with Redmine's own
# Rails runner in the site's container (.github/scripts/build-ddev-site.sh, COUNTS_ONLY=1).
puts "issues: #{Issue.count}"
puts "notes: #{Journal.where.not(notes: [nil, '']).count}"
puts "journals: #{Journal.count}"
puts "journal details: #{JournalDetail.count}"
puts "time entries: #{TimeEntry.count}"
puts "versions: #{Version.count}"
puts "members: #{Member.count}"
puts "users: #{User.where(type: 'User').count}"
puts "attachments: #{Attachment.count}"
puts "watchers: #{Watcher.count}"
