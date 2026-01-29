/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Read and execute the schema.sql file
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(
    path.join(__dirname, '../src/db/schema.sql'),
    'utf8'
  );
  pgm.sql(schema);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS wiki_metadata CASCADE;
    DROP TABLE IF EXISTS wiki_drafts CASCADE;
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS challenges CASCADE;
    DROP TABLE IF NOT EXISTS decisions CASCADE;
    DROP TABLE IF EXISTS projects CASCADE;
    DROP EXTENSION IF EXISTS vector CASCADE;
    DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
  `);
};
