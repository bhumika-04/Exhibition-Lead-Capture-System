-- ============================================================
-- ELCS Data Reset Script — run before production deployment
-- Clears all lead/exhibition data.
-- Preserves: Employees, LookupSources, LookupStatuses
-- ============================================================

BEGIN TRANSACTION;

-- 1. Child tables of Leads (only if they exist)
IF OBJECT_ID('LeadMessages',    'U') IS NOT NULL DELETE FROM LeadMessages;
IF OBJECT_ID('LeadPersons',     'U') IS NOT NULL DELETE FROM LeadPersons;
IF OBJECT_ID('LeadPhones',      'U') IS NOT NULL DELETE FROM LeadPhones;
IF OBJECT_ID('LeadEmails',      'U') IS NOT NULL DELETE FROM LeadEmails;
IF OBJECT_ID('LeadAddresses',   'U') IS NOT NULL DELETE FROM LeadAddresses;
IF OBJECT_ID('LeadWebsites',    'U') IS NOT NULL DELETE FROM LeadWebsites;
IF OBJECT_ID('LeadServices',    'U') IS NOT NULL DELETE FROM LeadServices;
IF OBJECT_ID('LeadBrands',      'U') IS NOT NULL DELETE FROM LeadBrands;
IF OBJECT_ID('LeadTopics',      'U') IS NOT NULL DELETE FROM LeadTopics;

-- 2. Main Leads table
DELETE FROM Leads;
DBCC CHECKIDENT ('Leads', RESEED, 0);

-- 3. Exhibitions (comment out to keep existing exhibitions)
DELETE FROM Exhibitions;
DBCC CHECKIDENT ('Exhibitions', RESEED, 0);

COMMIT;

PRINT 'Reset complete. All leads and exhibitions cleared. Employees and lookups preserved.';
