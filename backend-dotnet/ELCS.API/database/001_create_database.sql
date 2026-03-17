-- ============================================================
-- ELCS — Exhibition Lead Capture System
-- Full Database Setup Script
--
-- HOW TO USE:
--   1. Open SQL Server Management Studio (SSMS) or Azure Data Studio
--   2. Connect to your SQL Server instance
--   3. Run this entire script — it will create the database,
--      all tables, indexes, constraints, and seed data.
--   4. Update appsettings.json with your connection string.
--
-- Default login after setup:
--   Email    : admin@example.com
--   Password : admin123
--
-- Compatibility : SQL Server 2019 or later
-- ============================================================

-- ─── CREATE DATABASE ─────────────────────────────────────────
-- Change 'ELCS' below to your preferred database name.
-- Also update the filename paths if needed (Linux paths shown for Docker/Linux SQL Server).

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'ELCS')
BEGIN
    CREATE DATABASE [ELCS];
END
GO

USE [ELCS];
GO

-- ─── 1. LOOKUP SOURCES ───────────────────────────────────────
-- How a lead was captured. SourceCode is a FK on Leads.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LookupSources')
BEGIN
    CREATE TABLE [dbo].[LookupSources] (
        [SourceCode]  VARCHAR(50)    NOT NULL PRIMARY KEY,
        [SourceName]  NVARCHAR(100)  NOT NULL,
        [Description] NVARCHAR(255)  NULL,
        [IsActive]    BIT            NULL DEFAULT (1)
    );

    INSERT INTO [dbo].[LookupSources] ([SourceCode], [SourceName], [Description]) VALUES
    ('employee_scan', 'Card Scan',    'Lead captured by scanning a visiting card'),
    ('manual_entry',  'Manual Entry', 'Lead entered manually by an employee'),
    ('import',        'Imported',     'Lead imported from an external file');
END
GO

-- ─── 2. LOOKUP STATUSES ──────────────────────────────────────
-- Current state of a lead. StatusCode is a FK on Leads.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LookupStatuses')
BEGIN
    CREATE TABLE [dbo].[LookupStatuses] (
        [StatusCode]  VARCHAR(50)    NOT NULL PRIMARY KEY,
        [StatusName]  NVARCHAR(100)  NOT NULL,
        [Description] NVARCHAR(255)  NULL,
        [SortOrder]   INT            NULL DEFAULT (0),
        [IsActive]    BIT            NULL DEFAULT (1)
    );

    INSERT INTO [dbo].[LookupStatuses] ([StatusCode], [StatusName], [SortOrder]) VALUES
    ('new',          'New',          1),
    ('confirmed',    'Confirmed',    2),
    ('pending',      'Pending',      3),
    ('followed_up',  'Followed Up',  4),
    ('converted',    'Converted',    5),
    ('lost',         'Lost',         6);
END
GO

-- ─── 3. EXHIBITIONS ──────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Exhibitions')
BEGIN
    CREATE TABLE [dbo].[Exhibitions] (
        [ExhibitionId] INT             IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Name]         NVARCHAR(300)   NOT NULL,
        [Location]     NVARCHAR(500)   NULL,
        [StartDate]    DATE            NOT NULL,
        [EndDate]      DATE            NOT NULL,
        [Description]  NVARCHAR(MAX)   NULL,
        [IsActive]     BIT             NULL DEFAULT (1),
        [CreatedAt]    DATETIME2(7)    NULL DEFAULT (GETUTCDATE()),
        [UpdatedAt]    DATETIME2(7)    NULL DEFAULT (GETUTCDATE())
    );

    -- Seed: one default exhibition so the app works immediately after setup
    INSERT INTO [dbo].[Exhibitions] ([Name], [Location], [StartDate], [EndDate], [Description], [IsActive])
    VALUES ('Default Exhibition', 'TBD', CAST(GETUTCDATE() AS DATE), CAST(DATEADD(DAY, 7, GETUTCDATE()) AS DATE), 'Auto-created during setup. Update or replace this before going live.', 1);
END
GO

-- ─── 4. ROLES ────────────────────────────────────────────────
-- Permission keys used by the frontend:
--   scan_cards         → /chat (Card Scan page)
--   view_leads         → /leads, /leads/[id]
--   view_dashboard     → /dashboard
--   view_exhibitions   → /exhibitions (read-only)
--   manage_exhibitions → /exhibitions create/edit/delete
--   view_report        → /report
--   push_to_crm        → Push to CRM/ERP button on lead detail
--   manage_users       → /users
--   manage_roles       → /roles
--
-- Employees with NULL RoleId have full access (admin behaviour).

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Roles')
BEGIN
    CREATE TABLE [dbo].[Roles] (
        [RoleId]      INT            IDENTITY(1,1) NOT NULL,
        [RoleName]    NVARCHAR(100)  NOT NULL,
        [Description] NVARCHAR(500)  NULL,
        [Permissions] NVARCHAR(MAX)  NOT NULL DEFAULT ('[]'),  -- JSON array of permission keys
        [CreatedAt]   DATETIME       NOT NULL DEFAULT (GETUTCDATE()),
        CONSTRAINT PK_Roles PRIMARY KEY ([RoleId]),
        CONSTRAINT UQ_Roles_RoleName UNIQUE ([RoleName])
    );

    INSERT INTO [dbo].[Roles] ([RoleName], [Description], [Permissions]) VALUES
    (
        'Admin',
        'Full access to all features',
        '["scan_cards","view_leads","view_dashboard","view_exhibitions","manage_exhibitions","view_report","push_to_crm","manage_users","manage_roles"]'
    ),
    (
        'Manager',
        'Can view all features, manage exhibitions, and push to CRM',
        '["scan_cards","view_leads","view_dashboard","view_exhibitions","manage_exhibitions","view_report","push_to_crm"]'
    ),
    (
        'Salesperson',
        'Can only scan visiting cards and record voice notes',
        '["scan_cards"]'
    );
END
GO

-- ─── 5. EMPLOYEES ────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Employees')
BEGIN
    CREATE TABLE [dbo].[Employees] (
        [EmployeeId]   INT            IDENTITY(1,1) NOT NULL,
        [FullName]     NVARCHAR(200)  NOT NULL,
        [Email]        NVARCHAR(255)  NOT NULL,
        [Phone]        NVARCHAR(20)   NULL,
        [Designation]  NVARCHAR(100)  NULL,
        [PasswordHash] NVARCHAR(255)  NOT NULL,  -- SHA-256 hex (lowercase)
        [IsActive]     BIT            NULL DEFAULT (1),
        [CreatedAt]    DATETIME2(7)   NULL DEFAULT (GETUTCDATE()),
        [CompanyName]  NVARCHAR(200)  NULL,
        [RoleId]       INT            NULL,
        CONSTRAINT PK_Employees PRIMARY KEY ([EmployeeId]),
        CONSTRAINT UQ_Employees_Email UNIQUE ([Email]),
        CONSTRAINT FK_Employees_Roles FOREIGN KEY ([RoleId]) REFERENCES [dbo].[Roles]([RoleId])
    );

    -- Default admin account
    -- Email    : admin@example.com
    -- Password : admin123
    -- SHA-256("admin123") lowercase hex = 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
    --
    -- To generate a hash for a different password:
    --   PowerShell : (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes("YourPass"))) -Algorithm SHA256).Hash.ToLower()
    --   Python     : import hashlib; hashlib.sha256(b"YourPass").hexdigest()
    --   Node.js    : require("crypto").createHash("sha256").update("YourPass").digest("hex")
    INSERT INTO [dbo].[Employees] ([FullName], [Email], [Designation], [PasswordHash], [IsActive], [RoleId])
    VALUES ('Administrator', 'admin@example.com', 'System Administrator', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 1, NULL);
    -- RoleId = NULL means full admin access (no restrictions)
END
GO

-- ─── 6. LEADS ────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Leads')
BEGIN
    CREATE TABLE [dbo].[Leads] (
        [LeadId]                    INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ExhibitionId]              INT            NOT NULL,
        [SourceCode]                VARCHAR(50)    NOT NULL,
        [StatusCode]                VARCHAR(50)    NOT NULL DEFAULT ('new'),
        [AssignedEmployeeId]        INT            NULL,

        -- Primary visitor (extracted from business card)
        [CompanyName]               NVARCHAR(300)  NULL,
        [PrimaryVisitorName]        NVARCHAR(200)  NULL,
        [PrimaryVisitorDesignation] NVARCHAR(150)  NULL,
        [PrimaryVisitorPhone]       NVARCHAR(50)   NULL,
        [PrimaryVisitorEmail]       NVARCHAR(255)  NULL,

        -- Lead classification
        [Segment]                   NVARCHAR(50)   NULL,   -- decision_maker | influencer | researcher | general
        [Priority]                  NVARCHAR(20)   NULL,   -- high | medium | low

        -- Notes & raw extraction data
        [DiscussionSummary]         NVARCHAR(MAX)  NULL,
        [RawCardJson]               NVARCHAR(MAX)  NULL,

        -- Timestamps
        [CreatedAt]                 DATETIME2(7)   NULL DEFAULT (GETUTCDATE()),
        [UpdatedAt]                 DATETIME2(7)   NULL DEFAULT (GETUTCDATE()),

        -- WhatsApp / confirmation tracking
        [WhatsAppConfirmed]         BIT            NULL DEFAULT (0),
        [ConfirmedAt]               DATETIME2(7)   NULL,

        -- Soft delete flag
        [IsActive]                  BIT            NOT NULL DEFAULT (1),

        -- CRM integration
        [CrmLedgerId]               BIGINT         NULL,

        -- JSON columns for additional extracted data (replaces normalised child tables)
        -- AdditionalPersons : [{"name":"...","designation":"...","phone":"...","email":"..."}]
        [AdditionalPersons]         NVARCHAR(MAX)  NULL,
        -- PhoneNumbers      : [{"phone":"...","type":""}]
        [PhoneNumbers]              NVARCHAR(MAX)  NULL,
        -- EmailAddresses    : [{"email":"...","type":""}]
        [EmailAddresses]            NVARCHAR(MAX)  NULL,
        -- Addresses         : [{"address":"...","type":"...","city":"...","state":"...","country":"...","pincode":"..."}]
        [Addresses]                 NVARCHAR(MAX)  NULL,
        -- Websites          : ["https://example.com"]
        [Websites]                  NVARCHAR(MAX)  NULL,
        -- Services          : ["Service A","Service B"]
        [Services]                  NVARCHAR(MAX)  NULL,
        -- Brands            : [{"brand":"...","relationship":"..."}]
        [Brands]                    NVARCHAR(MAX)  NULL,
        -- Topics            : ["Topic discussed during meeting"]
        [Topics]                    NVARCHAR(MAX)  NULL,

        CONSTRAINT FK_Leads_Exhibitions FOREIGN KEY ([ExhibitionId])  REFERENCES [dbo].[Exhibitions]([ExhibitionId]),
        CONSTRAINT FK_Leads_Employees   FOREIGN KEY ([AssignedEmployeeId]) REFERENCES [dbo].[Employees]([EmployeeId]),
        CONSTRAINT FK_Leads_Sources     FOREIGN KEY ([SourceCode])    REFERENCES [dbo].[LookupSources]([SourceCode]),
        CONSTRAINT FK_Leads_Statuses    FOREIGN KEY ([StatusCode])    REFERENCES [dbo].[LookupStatuses]([StatusCode])
    );

    CREATE NONCLUSTERED INDEX [IX_Leads_Exhibition]  ON [dbo].[Leads] ([ExhibitionId] ASC);
    CREATE NONCLUSTERED INDEX [IX_Leads_Employee]    ON [dbo].[Leads] ([AssignedEmployeeId] ASC);
    CREATE NONCLUSTERED INDEX [IX_Leads_Status]      ON [dbo].[Leads] ([StatusCode] ASC);
    CREATE NONCLUSTERED INDEX [IX_Leads_Source]      ON [dbo].[Leads] ([SourceCode] ASC);
    CREATE NONCLUSTERED INDEX [IX_Leads_CreatedAt]   ON [dbo].[Leads] ([CreatedAt] DESC);
    CREATE NONCLUSTERED INDEX [IX_Leads_IsActive]    ON [dbo].[Leads] ([IsActive] ASC);
    CREATE NONCLUSTERED INDEX [IX_Leads_Phone]       ON [dbo].[Leads] ([PrimaryVisitorPhone] ASC);
    CREATE NONCLUSTERED INDEX [IX_Leads_Email]       ON [dbo].[Leads] ([PrimaryVisitorEmail] ASC);
END
GO

-- ─── 7. LEAD MESSAGES ────────────────────────────────────────
-- Chat-style history attached to each lead.
-- SenderType: 'employee' | 'system'

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LeadMessages')
BEGIN
    CREATE TABLE [dbo].[LeadMessages] (
        [MessageId]        INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [LeadId]           INT           NOT NULL,
        [SenderType]       VARCHAR(20)   NOT NULL,   -- 'employee' or 'system'
        [SenderEmployeeId] INT           NULL,
        [MessageText]      NVARCHAR(MAX) NULL,
        [CreatedAt]        DATETIME2(7)  NULL DEFAULT (GETUTCDATE()),

        CONSTRAINT FK_LeadMessages_Leads     FOREIGN KEY ([LeadId])           REFERENCES [dbo].[Leads]([LeadId])     ON DELETE CASCADE,
        CONSTRAINT FK_LeadMessages_Employees FOREIGN KEY ([SenderEmployeeId]) REFERENCES [dbo].[Employees]([EmployeeId])
    );

    CREATE NONCLUSTERED INDEX [IX_LeadMessages_Lead] ON [dbo].[LeadMessages] ([LeadId] ASC, [CreatedAt] DESC);
END
GO

-- ─── DONE ─────────────────────────────────────────────────────
PRINT '================================================';
PRINT 'ELCS database setup complete.';
PRINT '';
PRINT 'Default admin login:';
PRINT '  Email    : admin@example.com';
PRINT '  Password : admin123';
PRINT '';
PRINT 'IMPORTANT: Change the admin password after first login.';
PRINT '================================================';
