-- Migration 009: Add Roles table and RoleId to Employees
-- Run this script on the ELCS database before deploying the updated backend.

-- 1. Create Roles table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Roles')
BEGIN
    CREATE TABLE Roles (
        RoleId      INT IDENTITY(1,1) PRIMARY KEY,
        RoleName    NVARCHAR(100) NOT NULL UNIQUE,
        Description NVARCHAR(500) NULL,
        Permissions NVARCHAR(MAX) NOT NULL DEFAULT '[]',
        CreatedAt   DATETIME NOT NULL DEFAULT GETUTCDATE()
    );
END

-- 2. Add RoleId column to Employees (nullable — existing rows get NULL → full access / admin behaviour)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Employees' AND COLUMN_NAME = 'RoleId'
)
BEGIN
    ALTER TABLE Employees ADD RoleId INT NULL;
END

-- 3. Add FK constraint (only if not already present)
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Employees_Roles'
)
BEGIN
    ALTER TABLE Employees
        ADD CONSTRAINT FK_Employees_Roles
        FOREIGN KEY (RoleId) REFERENCES Roles(RoleId);
END

-- 4. Insert default roles (skip if already exist)
-- Permission keys used by the app:
--   scan_cards          → /chat (Scan page)
--   view_leads          → /leads, /leads/[id]
--   view_dashboard      → /dashboard
--   view_exhibitions    → /exhibitions (read-only)
--   manage_exhibitions  → /exhibitions create/edit/delete buttons
--   view_report         → /report
--   push_to_crm         → Push to CRM/ERP button on lead detail
--   manage_users        → /users
--   manage_roles        → /roles
-- NOTE: NULL RoleId = no role = full access (existing admin accounts stay untouched)

IF NOT EXISTS (SELECT 1 FROM Roles WHERE RoleName = 'Admin')
BEGIN
    INSERT INTO Roles (RoleName, Description, Permissions) VALUES
    (
        'Admin',
        'Full access to all features',
        '["scan_cards","view_leads","view_dashboard","view_exhibitions","manage_exhibitions","view_report","push_to_crm","manage_users","manage_roles"]'
    );
END

IF NOT EXISTS (SELECT 1 FROM Roles WHERE RoleName = 'Manager')
BEGIN
    INSERT INTO Roles (RoleName, Description, Permissions) VALUES
    (
        'Manager',
        'Can view all features, manage exhibitions, and push to CRM',
        '["scan_cards","view_leads","view_dashboard","view_exhibitions","manage_exhibitions","view_report","push_to_crm"]'
    );
END

-- Salesperson: scan-only — all other pages redirect to /chat
IF NOT EXISTS (SELECT 1 FROM Roles WHERE RoleName = 'Salesperson')
BEGIN
    INSERT INTO Roles (RoleName, Description, Permissions) VALUES
    (
        'Salesperson',
        'Can only scan visiting cards and record voice notes',
        '["scan_cards"]'
    );
END
