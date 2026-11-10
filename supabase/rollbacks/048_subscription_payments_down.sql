-- Removes the payment notes added by 048. This deletes what was recorded in them.
-- Activating a subscription keeps working without this table.

DROP TABLE IF EXISTS subscription_payments;
