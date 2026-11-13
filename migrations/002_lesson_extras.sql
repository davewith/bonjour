-- 002_lesson_extras.sql — store spoken examples and common mistakes as JSON
-- on the lesson row so the tutor can retrieve them without re-reading Markdown.

ALTER TABLE lessons ADD COLUMN common_mistakes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN spoken_examples TEXT NOT NULL DEFAULT '[]';
