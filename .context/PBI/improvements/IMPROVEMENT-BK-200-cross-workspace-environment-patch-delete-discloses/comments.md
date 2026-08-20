# Comments for BK-200

[View in Jira](https://jira.upexgalaxy.com/browse/BK-200)

---

### Ely - 2/8/2026, 20:27:29

Root-cause fix implemented and PR opened: https://github.com/upex-galaxy/upex-bunkai-tms/pull/109 (fix/BK-200-cross-workspace-environment-404 -> staging).

Root cause confirmed against the live database (not just the migration's prose): bunkai*rename*environment / bunkai*delete*environment resolve the environment's project via a SECURITY DEFINER query. project*environments has RLS enabled but not FORCE'd, and both functions are owned by postgres, which carries rolbypassrls = true (verified live via pg*roles). A bypassrls role ignores FORCE ROW LEVEL SECURITY unconditionally, so that alternative fix would not have worked. A foreign-workspace environment id resolves to a real project id, and the shared write-gate raises 42501 (forbidden, mapped to 403) for the non-member actor instead of the documented non-disclosing 404.

Fix: inline the membership check in both RPCs so a missing environment and a foreign-workspace environment raise the SAME P0002 (not*found). The shared bunkai*assert*actor*can*write*project helper is untouched (out of scope - used by RPCs that take a caller-supplied project id already known from the URL).

Added real DB-integration regression tests (lib/environments/environments-rpc.test.ts) that create an environment in one workspace and attempt rename/delete as a genuine member of a different workspace, confirmed RED against the live unfixed database (P0002 expected, 42501 received) before finalizing the fix.

Status: migration 0053*environment*cross*workspace*404.sql is written and reviewed but NOT YET applied to the shared instance - this project's autonomous_delivery.migrations setting requires explicit approval before applying a live SECURITY DEFINER function change, even a narrow one. Escalated to the orchestrator for that approval. PR will merge once the migration is applied and the full suite goes green.


---

### Automation for Jira - 3/8/2026, 06:45:58

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 3/8/2026, 06:46:13

✅ Pull Request is successfully MERGED and DEPLOYED on QA. 
It's Ready for Testing Phase! 
Dev Task is Done.

---


_Synced from Jira by sync-jira-issues_
