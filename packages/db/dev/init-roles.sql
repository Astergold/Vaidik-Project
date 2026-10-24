-- Dev/CI bootstrap: create the app role WITH a login password before migrations run.
-- (Migration 0100 skips creation if the role already exists.)
-- Production: I1 runs ALTER ROLE crm_app LOGIN PASSWORD '<from password manager>' once.
create role crm_app login password 'crm_app_dev' noinherit nobypassrls;
