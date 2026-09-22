ALTER TABLE point_transactions ADD COLUMN source TEXT CHECK (source IN ('qr','teacher_direct','teacher_correction'));
