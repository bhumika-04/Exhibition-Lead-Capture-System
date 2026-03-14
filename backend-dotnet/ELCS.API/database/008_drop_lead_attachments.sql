-- Migration 008: Drop LeadAttachments table
-- Card images and audio files are no longer stored on disk.
-- The LeadAttachments table is therefore unused.

IF OBJECT_ID('LeadAttachments', 'U') IS NOT NULL
BEGIN
    DROP TABLE LeadAttachments;
    PRINT 'LeadAttachments table dropped.';
END
ELSE
    PRINT 'LeadAttachments table does not exist — skipping.';
