CREATE TABLE theme_engagement_daily (
  theme_id TEXT NOT NULL CHECK (
    length(theme_id) BETWEEN 1 AND 128
    AND theme_id NOT GLOB '*[^A-Za-z0-9._-]*'
  ),
  day TEXT NOT NULL CHECK (
    length(day) = 10
    AND substr(day, 5, 1) = '-'
    AND substr(day, 8, 1) = '-'
    AND substr(day, 1, 4) NOT GLOB '*[^0-9]*'
    AND substr(day, 6, 2) NOT GLOB '*[^0-9]*'
    AND substr(day, 9, 2) NOT GLOB '*[^0-9]*'
  ),
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  copies INTEGER NOT NULL DEFAULT 0 CHECK (copies >= 0),
  hearts INTEGER NOT NULL DEFAULT 0 CHECK (hearts >= 0),
  views_minute TEXT CHECK (
    views_minute IS NULL OR (
      length(views_minute) = 16
      AND substr(views_minute, 5, 1) = '-'
      AND substr(views_minute, 8, 1) = '-'
      AND substr(views_minute, 11, 1) = 'T'
      AND substr(views_minute, 14, 1) = ':'
      AND substr(views_minute, 1, 4) NOT GLOB '*[^0-9]*'
      AND substr(views_minute, 6, 2) NOT GLOB '*[^0-9]*'
      AND substr(views_minute, 9, 2) NOT GLOB '*[^0-9]*'
      AND substr(views_minute, 12, 2) NOT GLOB '*[^0-9]*'
      AND substr(views_minute, 15, 2) NOT GLOB '*[^0-9]*'
    )
  ),
  views_minute_count INTEGER NOT NULL DEFAULT 0 CHECK (views_minute_count >= 0),
  copies_minute TEXT CHECK (
    copies_minute IS NULL OR (
      length(copies_minute) = 16
      AND substr(copies_minute, 5, 1) = '-'
      AND substr(copies_minute, 8, 1) = '-'
      AND substr(copies_minute, 11, 1) = 'T'
      AND substr(copies_minute, 14, 1) = ':'
      AND substr(copies_minute, 1, 4) NOT GLOB '*[^0-9]*'
      AND substr(copies_minute, 6, 2) NOT GLOB '*[^0-9]*'
      AND substr(copies_minute, 9, 2) NOT GLOB '*[^0-9]*'
      AND substr(copies_minute, 12, 2) NOT GLOB '*[^0-9]*'
      AND substr(copies_minute, 15, 2) NOT GLOB '*[^0-9]*'
    )
  ),
  copies_minute_count INTEGER NOT NULL DEFAULT 0 CHECK (copies_minute_count >= 0),
  hearts_minute TEXT CHECK (
    hearts_minute IS NULL OR (
      length(hearts_minute) = 16
      AND substr(hearts_minute, 5, 1) = '-'
      AND substr(hearts_minute, 8, 1) = '-'
      AND substr(hearts_minute, 11, 1) = 'T'
      AND substr(hearts_minute, 14, 1) = ':'
      AND substr(hearts_minute, 1, 4) NOT GLOB '*[^0-9]*'
      AND substr(hearts_minute, 6, 2) NOT GLOB '*[^0-9]*'
      AND substr(hearts_minute, 9, 2) NOT GLOB '*[^0-9]*'
      AND substr(hearts_minute, 12, 2) NOT GLOB '*[^0-9]*'
      AND substr(hearts_minute, 15, 2) NOT GLOB '*[^0-9]*'
    )
  ),
  hearts_minute_count INTEGER NOT NULL DEFAULT 0 CHECK (hearts_minute_count >= 0),
  PRIMARY KEY (theme_id, day)
) WITHOUT ROWID;
