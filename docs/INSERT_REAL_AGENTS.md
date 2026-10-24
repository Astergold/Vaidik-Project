-- Ready-to-run: insert your real Godrah agents (replace with your IDs/names from Godrah dashboard)
INSERT INTO crm.ai_agent (id, tenant_id, name, display_name, language, status, created_by)
VALUES
('agent-your-1', '2308e7f0-5eae-4ba6-9d0d-46640e1e3b68', 'Your Agent 1', 'Your Agent 1', 'en', 'active', '01a16451-6760-7934-b5d7-42f85b1ffa23'),
('agent-your-2', '2308e7f0-5eae-4ba6-9d0d-46640e1e3b68', 'Your Agent 2', 'Your Agent 2', 'en', 'active', '01a16451-6760-7934-b5d7-42f85b1ffa23')
ON CONFLICT DO NOTHING;

-- Then create campaign via web at localhost:3002 (login: owner@mit-adt.local / Dev-Password-123!)
-- Select your agent in dropdown → Save → Start → campaign.start runs wave dispatch.
