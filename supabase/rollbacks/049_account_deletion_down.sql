-- Undoes 049_account_deletion.sql. Accounts already deleted stay deleted;
-- this only removes the request table and its functions.
DROP FUNCTION IF EXISTS admin_delete_business(uuid);
DROP FUNCTION IF EXISTS admin_business_files(uuid);
DROP FUNCTION IF EXISTS cancel_account_deletion(uuid);
DROP FUNCTION IF EXISTS request_account_deletion(uuid, text);
DROP FUNCTION IF EXISTS my_account_deletion_request(uuid);
DROP TABLE IF EXISTS account_deletion_requests;
