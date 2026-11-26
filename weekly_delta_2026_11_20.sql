-- ============================================================================
-- GREATER MEMPHIS IT JOBS DATABASE — WEEKLY DELTA PATCH
-- Delta Window: November 5 – November 20, 2026 (Wed Nov 11 & Wed Nov 18 Cycles)
-- Target DB: memphis_it_jobs_2026.db (Baseline: 86 companies, 118 jobs)
-- Post-Patch Totals: 90 companies (75 active, 15 watchlist) | 152 cumulative jobs (143 active, 9 closed)
-- ============================================================================

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- ----------------------------------------------------------------------------
-- STAGE 1: EMPLOYER REGISTRY UPDATES, WATCHLIST GRADUATION & NEW ENTRANTS
-- ----------------------------------------------------------------------------

-- 1A. Graduate Buckman from Watchlist (1) to Active (0)
UPDATE companies
SET is_watchlist_only = 0,
    local_tech_roles_est = 1,
    total_company_open_roles_2026 = 43,
    notes = 'GRADUATED FROM WATCHLIST (Nov 2026): Active Memphis HQ hiring for Digital Innovation Engineer ($90K-$110K). Sr Lead Digital Innovation Engineer - Solution Architect excluded (Built In lists it in Chennai, India).'
WHERE company_name = 'Buckman';

-- 1B. Update Active & Watchlist Companies with Nov 5-20 Velocity & News
UPDATE companies
SET local_tech_roles_est = 42,
    total_company_open_roles_2026 = 95,
    notes = 'Nov 6: Musk confirmed 2 new sites near Colossus II/Macrohard; Nov 13: MDEQ affirmed Southaven turbine permits; Nov 20 Greenhouse sweep added Automation & Controls Eng, Supercompute Ops Eng, and new DC Ops Tech req.'
WHERE company_name = 'xAI (SpaceXSI)';

UPDATE companies
SET local_tech_roles_est = 24,
    total_company_open_roles_2026 = 135,
    notes = 'Nov 5-20 sweep: Closed Nov 4-6 cyber/Salesforce reqs; opened 8 new Memphis/Collierville Data, Cyber IAM (AI/Okta, closes Nov 24), BSA (.NET/API, closes Nov 27), Data Analyst (closes Nov 27), and Eng Manager roles.'
WHERE company_name = 'FedEx Corporation';

UPDATE companies
SET local_tech_roles_est = 23,
    total_company_open_roles_2026 = 105,
    notes = 'Nov 18 surge: Added IT Mgr Order Mgmt & Fulfillment, Systems Eng InfoSec IAM, Sr Financial Systems Analyst, Store Hardware Support, plus IT Mgr FinOps & Sr Data Scientist.'
WHERE company_name = 'AutoZone';

UPDATE companies
SET local_tech_roles_est = 12,
    total_company_open_roles_2026 = 160,
    notes = 'Nov 20 6-page SearchJobs audit: Added Network Voice Analyst I (JR8181) & Sr Image Data Scientist (JR8172); JR7630 (Epic Inpatient Analyst) no longer listed; JR6632 pay disclosed at $86K-$155K.'
WHERE company_name = 'St. Jude Children''s Research Hospital';

UPDATE companies
SET local_tech_roles_est = 8,
    total_company_open_roles_2026 = 65,
    notes = 'Shelby County IT category grew from 6 to 8 active roles in Nov 2026 (+Computer Systems Analyst Assessor & +Programmer Analyst I Planning & Dev).'
WHERE company_name = 'Shelby County Government';

UPDATE companies
SET local_tech_roles_est = 8,
    total_company_open_roles_2026 = 58,
    notes = 'Posted onsite Cyber Security Analyst/Engineer (Job 1707, Nov 7); IT Developer Sr (Job 1595) explicitly mandates coding agents & agentic AI workflow maintenance.'
WHERE company_name = 'First Horizon Bank';

UPDATE companies
SET local_tech_roles_est = 6,
    total_company_open_roles_2026 = 45,
    notes = 'Newly posted Application Developer - Security Engineering (R80066, Google SecOps/SOAR/Python) & IT Security Engineer III/CyberArk; R78458 closes Nov 30.'
WHERE company_name = 'Sedgwick';

UPDATE companies
SET local_tech_roles_est = 8,
    total_company_open_roles_2026 = 34,
    notes = 'Active Property Technology Solutions Manager (Job 224920) and Senior DevOps Engineer (posted Nov 12) at Memphis Commercial Services Ctr.'
WHERE company_name = 'Hilton (Memphis Ctr)';

UPDATE companies
SET local_tech_roles_est = 3,
    total_company_open_roles_2026 = 78,
    notes = 'MAJOR EXPANSION (Nov 9 Daily Memphian): Hiring 300+ roles at AI-infrastructure manufacturing plant in Byhalia, MS; active Byhalia postings include Test Engineer IV (J2470963) & IT Support Tech II.'
WHERE company_name = 'Jabil Circuit';

UPDATE companies
SET local_tech_roles_est = 2,
    total_company_open_roles_2026 = 14,
    notes = 'Nov 20 Greenhouse sweep: 14 total open roles (down from 17 on Nov 3). IT Governance/DR (5453792008) removed; replaced by IT Knowledge Management Analyst (5481331008, AI agents/content governance, $55K-$85K).'
WHERE company_name = 'Cook Systems';

UPDATE companies
SET local_tech_roles_est = 9,
    total_company_open_roles_2026 = 284,
    notes = 'Metaintro Nov 20: 102 indexed open roles (+1% WoW, 7 new roles this week; 36 in Collierville, 5 Developer roles), adding Advisor Financial Systems & Analyst Financial Systems.'
WHERE company_name = 'Orgill, Inc.';

UPDATE companies
SET local_tech_roles_est = 4,
    total_company_open_roles_2026 = 38,
    notes = 'Added RAQA/Clinical IT Solutions Architect (Architecture Specialist 4, Req R92687, Hybrid Memphis).'
WHERE company_name = 'Smith+Nephew';

UPDATE companies
SET local_tech_roles_est = 5,
    total_company_open_roles_2026 = 220,
    notes = 'Nov 20 sweep: Associate Developer ServiceNow (R-21998) removed from IT General board; Manager IT IS II and Unified Communications Analyst I - Mobility refreshed.'
WHERE company_name = 'Methodist Le Bonheur Healthcare';

UPDATE companies
SET notes = 'M&A ALERT (Nov 6, 2026): Midas Atlantic Partners announced acquisition of Sylvamo Europe (Brussels operations); Memphis HQ remains watchlist for domestic IT shifts.'
WHERE company_name = 'Sylvamo Corporation';

-- 1C. Insert 4 Newly Discovered Employers (3 Active, 1 Watchlist)
INSERT INTO companies (
    company_name, parent_or_group, sector, sub_market_corridor, ats_platform,
    career_portal_url, local_tech_roles_est, total_company_open_roles_2026, is_watchlist_only, notes
) VALUES
('CyberArk', 'CyberArk Software Ltd.', 'Identity Security & Enterprise Cybersecurity', 'Remote / Greater Memphis Target Market', 'HiringCafe / Custom', 'https://hiringcafe.com/jobs/software-engineer-memphis-tn', 1, 20, 0, 'Added Nov 2026: Hiring Principal Software Escalation Engineer ($147K-$238K/yr, Remote listing Memphis).'),
('Robert Half (Memphis IT Placements)', 'Robert Half Inc.', 'Enterprise Tech Staffing & Contract Placements', 'Downtown & East Memphis', 'Robert Half Portal', 'https://www.roberthalf.com/us/en/jobs/memphis-downtown-tn/all', 4, 53, 0, 'Added Nov 2026: Nov 9-10 onsite Cloud Engineers ($70-$85/hr Nov 9; $60-$70/hr Nov 10), Data Engineer ($70-$85/hr), and Nov 3 Cyber Security Engineer ($120K-$130K).'),
('SBase Technologies Inc.', 'SBase Technologies (Direct Client: ALSAC)', 'IT Consulting & Software Delivery', 'Memphis Medical District', 'Handshake / Direct', 'https://app.joinhandshake.com/public/jobs/11752371', 1, 5, 0, 'Added Nov 2026: Recruiting Day-1 Onsite Memphis Software Engineer (.NET, API, SQL Server) for direct client ALSAC.'),
('5C Group', '5C Group Data Center Developers', 'Hyperscale & Colocation Data Center Development', 'South / East Memphis (Getwell Rd)', 'Direct / News Watchlist', 'https://dailymemphian.com/search?s=xAI&so=0', 0, 0, 1, 'NEW WATCHLIST (Nov 10 Daily Memphian): Proposed data center at former Fred''s HQ on Getwell Rd; Mayor Paul Young blocked PILOT tax incentive.')
ON CONFLICT(company_name) DO UPDATE SET
    local_tech_roles_est = excluded.local_tech_roles_est,
    total_company_open_roles_2026 = excluded.total_company_open_roles_2026,
    notes = excluded.notes;

-- ----------------------------------------------------------------------------
-- STAGE 2A: MARK CLOSED / EXPIRED BASELINE ROLES (9 ROLES) & ENRICH ACTIVE ROWS
-- ----------------------------------------------------------------------------

UPDATE job_postings SET posting_status_2026 = 'Closed / Expired Nov 4, 2026' WHERE job_id = 42;
UPDATE job_postings SET posting_status_2026 = 'Closed / Expired Nov 6, 2026 (Reposted as P25-345720-5, Closed Nov 18, 2026)' WHERE job_id = 76;
UPDATE job_postings SET posting_status_2026 = 'Closed / Expired Nov 6, 2026 (Replaced by Req P25-385499-2)' WHERE job_id = 77;
UPDATE job_postings SET posting_status_2026 = 'Closed / Removed (Verified Nov 20, 2026 Greenhouse Audit)' WHERE job_id = 97;
UPDATE job_postings SET posting_status_2026 = 'Closed / Removed from IT General Board (Verified Nov 20, 2026)' WHERE job_id = 53;
UPDATE job_postings SET posting_status_2026 = 'Closed / Expired Oct 16, 2026 (Apply-Before Window Elapsed)' WHERE job_id = 104;
UPDATE job_postings SET posting_status_2026 = 'Closed / Removed (Absent from Nov 20, 2026 6-Page SearchJobs Audit)' WHERE job_id = 81;
UPDATE job_postings SET posting_status_2026 = 'Closed / Expired (ZipRecruiter Listing Expired)' WHERE job_id = 23;
UPDATE job_postings SET posting_status_2026 = 'Closed / Expired (ZipRecruiter Listing Expired)' WHERE job_id = 58;

-- Enrich still-active baseline rows with newly verified Nov 2026 pay, IDs, and deadlines
UPDATE job_postings
SET raw_compensation = '$86,000 - $155,000/yr',
    pay_basis_raw = 'Annual',
    annual_min_usd = 86000,
    annual_max_usd = 155000,
    annual_mid_usd = 120500,
    posting_status_2026 = 'Active Nov 20, 2026 (Pay Disclosed on HiringCafe)'
WHERE job_id = 50;

UPDATE job_postings
SET raw_compensation = '$80,000/yr',
    pay_basis_raw = 'Annual',
    annual_min_usd = 80000,
    annual_max_usd = 80000,
    annual_mid_usd = 80000,
    posting_status_2026 = 'Active Nov 20, 2026 (Pay Disclosed on HiringCafe)'
WHERE job_id = 67;

UPDATE job_postings
SET requisition_id = '260190',
    posting_status_2026 = 'Active Nov 20, 2026 (Apply Before Dec 31, 2026)',
    source_url = 'https://iayzqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/260190'
WHERE job_id = 103;

UPDATE job_postings
SET posting_status_2026 = 'Active Nov 20, 2026 — IMMINENT DEADLINE: Valid Through Nov 30, 2026'
WHERE job_id = 46;

UPDATE job_postings
SET posting_status_2026 = 'Reposted Nov 18, 2026 (HiringCafe 2d ago) — Open Until Dec 1, 2026'
WHERE job_id = 64;

UPDATE job_postings
SET requisition_id = '1595',
    tech_stack_tags = 'TypeScript, React, NestJS/Node.js, PostgreSQL, Azure, Kubernetes, Databricks, PySpark, C#/.NET, Coding Agents / Agentic AI Workflows',
    source_url = 'https://ibpwjb.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/job/1595'
WHERE job_id = 56;

UPDATE job_postings
SET source_url = 'https://careers.methodisthealth.org/job/memphis/manager-it-information-systems-ii/47203/103163733184',
    posting_status_2026 = 'Active / Refreshed Nov 20, 2026'
WHERE job_id = 11;

UPDATE job_postings
SET job_title = 'NOC Systems Analyst (Level II) & Network Engineer',
    posting_status_2026 = 'Updated Nov 20, 2026 (Escalations Engineer Removed; Network Engineer Active)'
WHERE job_id = 98;

-- ----------------------------------------------------------------------------
-- STAGE 2B & 3: INSERT 34 NEWLY VERIFIED NOVEMBER 2026 IT ROLES (IDs 119-153; 143 intentionally unused)
-- ----------------------------------------------------------------------------

INSERT OR REPLACE INTO job_postings (
    job_id, company_id, company_name, job_title, role_classification, seniority_level,
    city, state, zip_code, work_mode, residency_or_radius_rule, requisition_id,
    posting_status_2026, raw_compensation, pay_basis_raw, annual_min_usd, annual_max_usd, annual_mid_usd,
    tech_stack_tags, source_label, source_url
) VALUES
(119, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Manager, Engineering (Enterprise Data Group)', 'Technical Leadership', 'Manager', 'Memphis', 'TN', '38125', 'Hybrid', '3620 Hacks Cross Rd Bldg B; 50-mile campus hybrid rule', 'P25-395117-1', 'Active Nov 20, 2026', NULL, NULL, NULL, NULL, NULL, 'Enterprise Data Engineering Management, Cloud Data Platforms, Agile Delivery', 'FedEx Careers', 'https://careers.fedex.com/career-areas/professional/jobs'),
(120, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Sr Cyber Security Analyst (IAM & AI Automation)', 'Traditional IT', 'Senior', 'Memphis', 'TN', '38125', 'Hybrid', '3620 Hacks Cross Rd; 50-mile hybrid rule', 'P25-385499-2', 'Closes Nov 24, 2026 (5pm EST)', '$7,094.23 - $15,607.31/mo', 'Monthly', 85130.76, 187287.72, 136209.24, 'Okta, Okta Workflows, SailPoint, PAM, Active Directory, LDAP, PowerShell, Python, JavaScript, REST APIs, ServiceNow, AI Agents, GitHub Copilot', 'FedEx Careers', 'https://careers.fedex.com/sr-cyber-security-analyst/job/P25-385499-2'),
(121, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Cyber Security Analyst (IAM & Okta Automation)', 'Traditional IT', 'Mid-Level', 'Memphis', 'TN', '38125', 'Hybrid', '3620 Hacks Cross Rd; 50-mile hybrid rule', 'P25-385496-2', 'Closes Nov 24, 2026 (5pm EST)', '$6,168.90 - $13,571.58/mo', 'Monthly', 74026.80, 162858.96, 118442.88, 'Okta, Okta Workflows, SailPoint, PAM, Active Directory, LDAP, MFA/SSO, ServiceNow, Generative AI, GitHub Copilot, API Scripting', 'FedEx Careers', 'https://careers.fedex.com/cyber-security-analyst/job/P25-385496-2'),
(122, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Sr Business Systems Analyst (.NET / REST APIs)', 'Traditional IT', 'Senior', 'Collierville', 'TN', '38017', 'Hybrid', '20 FedEx Pkwy; 50-mile campus hybrid rule', 'P25-398155-1', 'Closes Nov 27, 2026 (5pm CST)', '$6,511.62 - $10,744.16/mo', 'Monthly', 78139.44, 128929.92, 103534.68, '.NET Framework, SQL, RESTful APIs, JavaScript, GitHub, Systems Requirements & Controls', 'FedEx Careers', 'https://careers.fedex.com/sr-business-systems-analyst/job/P25-398155-1'),
(123, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Data Analyst (SQL / Python / ETL Pipelines)', 'Architecture / Data / AI', 'Mid-Level', 'Collierville', 'TN', '38017', 'Hybrid', '10 FedEx Pkwy; 50-mile campus hybrid rule', 'P25-397333-1', 'Closes Nov 27, 2026 (5pm CST)', '$5,662.27 - $9,342.75/mo', 'Monthly', 67947.24, 112113.00, 90030.12, 'SQL, Python, ETL/ELT Pipelines, Data Modeling, Data Warehousing, BI Dashboards, Data Governance', 'FedEx Careers', 'https://careers.fedex.com/data-analyst/job/P25-397333-1'),
(124, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Sr Project Management Analyst (Systems Design)', 'Technical Leadership', 'Senior', 'Collierville', 'TN', '38017', 'Hybrid', '10 FedEx Pkwy; 50-mile campus hybrid rule', 'P25-398152-1', 'Closes Nov 30, 2026 (5pm CST)', '$6,511.62 - $10,744.16/mo', 'Monthly', 78139.44, 128929.92, 103534.68, 'IT Project Management, Systems Design & Implementation, Business Process Mapping, KPI Analytics', 'FedEx Careers', 'https://careers.fedex.com/sr-project-management-analyst/job/P25-398152-1'),
(125, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Sr Data Scientist', 'Architecture / Data / AI', 'Senior', 'Memphis', 'TN', '38125', 'Hybrid', '3680 Hacks Cross Rd; 50-mile hybrid rule', 'P25-396611-1', 'Active Nov 20, 2026', NULL, NULL, NULL, NULL, NULL, 'Data Science, Machine Learning, Predictive Modeling, Python, SQL', 'FedEx Careers', 'https://careers.fedex.com/jobs/page/4'),
(126, (SELECT company_id FROM companies WHERE company_name='FedEx Corporation'), 'FedEx Corporation', 'Associate Security Analyst', 'Traditional IT', 'Entry-Mid', 'Memphis', 'TN', '38116', 'Hybrid', '3865 Airways Blvd; Memphis campus', 'P25-398858-1', 'Active Nov 20, 2026', NULL, NULL, NULL, NULL, NULL, 'Security Operations, Risk Analysis, Corporate & Information Security', 'FedEx Careers', 'https://careers.fedex.com/jobs/page/4'),
(127, (SELECT company_id FROM companies WHERE company_name='AutoZone'), 'AutoZone', 'IT Manager - Order Management and Fulfillment Technology', 'Technical Leadership', 'Manager', 'Memphis', 'TN', '38103', 'On-site', 'Memphis HQ (123 S Front St)', NULL, 'Posted Nov 18, 2026', NULL, NULL, NULL, NULL, NULL, 'Order Management Systems (OMS), Fulfillment Technology, Retail Engineering Leadership', 'AutoZone Oracle HCM', 'https://careers.autozone.com/hcmUI/CandidateExperience/en/sites/CX_1/pages/6001'),
(128, (SELECT company_id FROM companies WHERE company_name='AutoZone'), 'AutoZone', 'IT Manager FinOps', 'Technical Leadership', 'Manager', 'Memphis', 'TN', '38103', 'On-site', 'Memphis HQ (123 S Front St)', NULL, 'Active Nov 2026', NULL, NULL, NULL, NULL, NULL, 'Cloud FinOps, GCP/Cloud Cost Optimization, FinOps Roadmap, People Management', 'AutoZone Oracle HCM', 'https://careers.autozone.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs?lastSelectedFacet=LOCATIONS&selectedCategoriesFacet=300000001250499&selectedLocationsFacet=300000000229164'),
(129, (SELECT company_id FROM companies WHERE company_name='AutoZone'), 'AutoZone', 'Systems Engineer, Information Security, IAM', 'Traditional IT', 'Mid-Senior', 'Memphis', 'TN', '38103', 'On-site', 'Memphis HQ (123 S Front St)', NULL, 'Posted Nov 18, 2026', NULL, NULL, NULL, NULL, NULL, 'Identity & Access Management (IAM), Information Security, Enterprise Access Controls', 'AutoZone Oracle HCM', 'https://careers.autozone.com/hcmUI/CandidateExperience/en/sites/CX_1/pages/6001'),
(130, (SELECT company_id FROM companies WHERE company_name='AutoZone'), 'AutoZone', 'Senior Financial Systems Analyst (ERP / Workday Adaptive)', 'Traditional IT', 'Senior', 'Memphis', 'TN', '38103', 'On-site', 'Memphis HQ (123 S Front St)', NULL, 'Posted Nov 18, 2026', NULL, NULL, NULL, NULL, NULL, 'ERP Reporting Architecture, Workday Adaptive Planning, Financial Systems Integration', 'AutoZone Oracle HCM', 'https://careers.autozone.com/hcmUI/CandidateExperience/en/sites/CX_1/pages/6001'),
(131, (SELECT company_id FROM companies WHERE company_name='AutoZone'), 'AutoZone', 'Systems Specialist (Store Hardware Support)', 'Tech Support', 'Entry-Mid', 'Memphis', 'TN', '38103', 'On-site', 'Memphis HQ', NULL, 'Posted Nov 18, 2026', NULL, NULL, NULL, NULL, NULL, 'Retail Store Hardware Support, POS Systems, Technical Troubleshooting', 'AutoZone Oracle HCM', 'https://careers.autozone.com/hcmUI/CandidateExperience/en/sites/CX_1/pages/6001'),
(132, (SELECT company_id FROM companies WHERE company_name='AutoZone'), 'AutoZone', 'Data Scientist, Senior - Store Operations', 'Architecture / Data / AI', 'Senior', 'Memphis', 'TN', '38103', 'On-site', 'Memphis HQ', NULL, 'Active Nov 2026', NULL, NULL, NULL, NULL, NULL, 'Data Science, Predictive Modeling, Python, SQL, Retail Store Operations Optimization', 'AutoZone Oracle HCM', 'https://careers.autozone.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs?lastSelectedFacet=LOCATIONS&selectedCategoriesFacet=300000001250499&selectedLocationsFacet=300000000229164'),
(133, (SELECT company_id FROM companies WHERE company_name='xAI (SpaceXSI)'), 'xAI (SpaceXSI)', 'Automation & Controls Engineer, Data Center Facilities', 'Traditional IT', 'Mid-Senior', 'Memphis / Southaven', 'TN/MS', NULL, 'On-site', 'Onsite in Memphis, TN or Southaven, MS', '5289470007', 'Added Nov 2026', NULL, NULL, NULL, NULL, NULL, 'Rockwell Studio 5000, Siemens TIA Portal, Beckhoff TwinCAT, Ignition/Niagara SCADA/BMS, BACnet/IP, Modbus TCP, OPC UA, MQTT, SNMP, EPLAN', 'xAI Greenhouse', 'https://job-boards.greenhouse.io/xai/jobs/5289470007'),
(134, (SELECT company_id FROM companies WHERE company_name='xAI (SpaceXSI)'), 'xAI (SpaceXSI)', 'Operations Engineer, Supercompute - Memphis', 'DevOps / Cloud / SRE', 'Mid-Senior', 'Memphis / Southaven', 'TN/MS', NULL, 'On-site', 'Onsite 24/7 Data Hall Sustainment (Memphis/Southaven)', '5273689007', 'Added Nov 2026', NULL, NULL, NULL, NULL, NULL, 'GB200/NVL72, H100/H200 GPU Fleets, NCCL, InfiniBand/RoCE, Slurm, Kubernetes, NVIDIA DCGM, Prometheus, Grafana, Redfish/IPMI, Python, Bash, Go/Rust/C++', 'xAI Greenhouse', 'https://job-boards.greenhouse.io/xai/jobs/5273689007'),
(135, (SELECT company_id FROM companies WHERE company_name='xAI (SpaceXSI)'), 'xAI (SpaceXSI)', 'Data Center Operations Technician - Memphis (New Req)', 'Traditional IT', 'Entry-Mid', 'Memphis / Southaven', 'TN/MS', NULL, 'On-site', 'Onsite in Memphis, TN or Southaven, MS', '5286282007', 'Added Nov 2026', NULL, NULL, NULL, NULL, NULL, 'Hyperscale Data Center Operations, Server Rack & Hardware Break/Fix, Fiber Cabling', 'xAI Greenhouse', 'https://job-boards.greenhouse.io/xai/jobs/5286282007'),
(136, (SELECT company_id FROM companies WHERE company_name='Sedgwick'), 'Sedgwick', 'Application Developer - Security Engineering', 'Software Development', 'Senior', 'Memphis', 'TN', '38125', 'On-site', 'Memphis, TN', 'R80066', 'Active / Newly Posted Nov 2026', NULL, NULL, NULL, NULL, NULL, 'Google SecOps (SIEM/SOAR), UDM Normalization, Sigma Detection-as-Code, Cribl, Logstash, Fluent Bit, Kafka, Python, REST APIs, OAuth 2.0, CI/CD, Azure/AWS/GCP', 'Sedgwick Workday', 'https://sedgwick.wd1.myworkdayjobs.com/sedgwick/job/memphis-tn/application-developer---security-engineering_r80066'),
(137, (SELECT company_id FROM companies WHERE company_name='First Horizon Bank'), 'First Horizon Bank', 'Cyber Security Analyst/Engineer (Vuln Mgmt & AppSec)', 'Traditional IT', 'Mid-Level', 'Memphis', 'TN', '38103', 'On-site', '165 Madison Ave, Memphis, TN — Onsite 5 days/week', '1707', 'Posted Nov 7, 2026', NULL, NULL, NULL, NULL, NULL, 'Vulnerability Management, AppSec Testing, SCA, Secrets/Dependency Scanning, AWS/Azure/M365 Security', 'First Horizon Oracle HCM', 'https://ibpwjb.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1707'),
(138, (SELECT company_id FROM companies WHERE company_name='Smith+Nephew'), 'Smith+Nephew', 'RAQA/Clinical IT Solutions Architect (Architecture Specialist 4)', 'Architecture / Data / AI', 'Architect / Senior', 'Memphis', 'TN', '38116', 'Hybrid', 'Hybrid Work Model in Memphis, TN (<25% travel)', 'R92687', 'Active Nov 2026', NULL, NULL, NULL, NULL, NULL, 'IT Solutions Architecture, Regulatory Affairs (RAQA), Clinical Enterprise Software, Risk & Trade-Off Design', 'Smith+Nephew Workday', 'https://smithnephew.wd5.myworkdayjobs.com/it-IT/External/job/Memphis-TN/Architecture-Specialist-4_R92687'),
(139, (SELECT company_id FROM companies WHERE company_name='Hilton (Memphis Ctr)'), 'Hilton (Memphis Ctr)', 'Property Technology Solutions Manager', 'Technical Leadership', 'Manager', 'Memphis', 'TN', '38119', 'Hybrid', 'Memphis Commercial Services Ctr (Hybrid; up to 10% travel)', '224920', 'Active Nov 2026 (Req 224920)', NULL, NULL, NULL, NULL, NULL, 'Property Tech Systems, Global Network Engineering Liaison, InfoSec, Privacy, HSM, Hospitality SaaS', 'Hilton Oracle HCM', 'https://efet.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1009/job/224920/'),
(140, (SELECT company_id FROM companies WHERE company_name='Hilton (Memphis Ctr)'), 'Hilton (Memphis Ctr)', 'Senior DevOps Engineer', 'DevOps / Cloud / SRE', 'Senior', 'Memphis', 'TN', '38119', 'Hybrid', 'Memphis, TN', '40455', 'Posted Nov 12, 2026', NULL, NULL, NULL, NULL, NULL, 'DevOps Engineering, CI/CD, Cloud Automation, Enterprise Hospitality Infrastructure', 'Hilton Listing', 'https://saarthilms.com/Job/job?id=40455'),
(141, (SELECT company_id FROM companies WHERE company_name='St. Jude Children''s Research Hospital'), 'St. Jude Children''s Research Hospital', 'Network Voice Analyst I', 'Traditional IT', 'Entry-Mid', 'Memphis', 'TN', '38105', 'On-site', 'Memphis Campus (Information Services)', 'JR8181', 'Added Nov 2026', NULL, NULL, NULL, NULL, NULL, 'Enterprise IP Telephony, Voice Networking, IT Infrastructure Operations', 'St. Jude Careers', 'https://talent.stjude.org/careers/JobDetail/Network-Voice-Analyst-I-JR8181/5771'),
(142, (SELECT company_id FROM companies WHERE company_name='St. Jude Children''s Research Hospital'), 'St. Jude Children''s Research Hospital', 'Senior Image Data Scientist – Center for Bioimage Informatics', 'Architecture / Data / AI', 'Senior', 'Memphis', 'TN', '38105', 'On-site', 'Memphis Campus (Scientific Director''s Office)', 'JR8172', 'Added Nov 2026', NULL, NULL, NULL, NULL, NULL, 'Bioimage Informatics, Computer Vision, Scientific Data Repositories, ML/AI Analysis', 'St. Jude Careers', 'https://talent.stjude.org/careers/JobDetail/Senior-Image-Data-Scientist-Center-for-Bioimage-Informatics-JR8172/5768'),
(144, (SELECT company_id FROM companies WHERE company_name='Buckman'), 'Buckman', 'Digital Innovation Engineer', 'Software Development', 'Mid-Senior', 'Memphis', 'TN', '38108', 'On-site', 'Memphis Global HQ (In-Person; no travel)', '87753221', 'Active Nov 2026', '$90,000 - $110,000/yr', 'Annual', 90000, 110000, 100000, 'Microservices, Serverless/Lambda, IoT/Embedded, Azure ML, AWS/Azure, SQL, NoSQL, Power BI, Hadoop/Hive', 'Ladders / Indeed', 'https://www.indeed.com/viewjob?jk=7a2c5b44c71ef0d1'),
(145, (SELECT company_id FROM companies WHERE company_name='Cook Systems'), 'Cook Systems', 'IT Knowledge Management Analyst (AI Enablement)', 'Traditional IT', 'Entry-Mid', 'Memphis', 'TN', '38119', 'Hybrid', 'Memphis, TN (Hybrid 3 days onsite; 6-mo renewable contract)', '5481331008', 'New Nov 2026 (Greenhouse)', '$55,000 - $85,000/yr', 'Annual', 55000, 85000, 70000, 'AI Agents Evaluation, Knowledge Architecture & Taxonomy, Content Governance, Confluence, SharePoint, Microsoft 365', 'Cook Systems Greenhouse', 'https://job-boards.greenhouse.io/cooksys/jobs/5481331008'),
(146, (SELECT company_id FROM companies WHERE company_name='Shelby County Government'), 'Shelby County Government', 'Computer Systems Analyst (Assessor)', 'Traditional IT', 'Mid-Level', 'Memphis', 'TN', '38103', 'On-site', 'Memphis, TN (Shelby County)', NULL, 'Posted Nov 4, 2026', NULL, NULL, NULL, NULL, NULL, 'County Property/Assessor Computer Systems Analysis, SQL, Enterprise Applications', 'Shelby Co. Oracle HCM', 'https://iayzqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs'),
(147, (SELECT company_id FROM companies WHERE company_name='Shelby County Government'), 'Shelby County Government', 'Programmer Analyst I (Planning & Development)', 'Software Development', 'Entry-Mid', 'Memphis', 'TN', '38103', 'On-site', 'Memphis, TN (Shelby County)', NULL, 'Posted Nov 3, 2026', NULL, NULL, NULL, NULL, NULL, 'Application Programming, Municipal Planning & GIS/Permitting Systems, SQL', 'Shelby Co. Oracle HCM', 'https://iayzqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs'),
(148, (SELECT company_id FROM companies WHERE company_name='Jabil Circuit'), 'Jabil Circuit', 'Test Engineer IV (Automated Test Software / AI-Infra Plant)', 'Software Development', 'Senior', 'Byhalia / Memphis', 'MS/TN', '38611', 'On-site', 'Byhalia, MS AI-Infrastructure Plant (300+ hiring wave)', 'J2470963', 'Posted Nov 3, 2026', NULL, NULL, NULL, NULL, NULL, 'Automated Test Systems, Test Software Development, Hardware/Fixture Validation, NPI, Data Analysis', 'Jabil Careers', 'https://jobs.jabil.com/en/job/byhalia/test-engineer-iv/626/102820695952'),
(149, (SELECT company_id FROM companies WHERE company_name='CyberArk'), 'CyberArk', 'Principal Software Escalation Engineer', 'Software Development', 'Principal / Staff', 'Memphis / US', 'TN', NULL, 'Remote', 'Remote Full-Time (Targeting Memphis & US Hubs)', NULL, 'Active Nov 2026 (HiringCafe 2w ago)', '$147,000 - $238,000/yr', 'Annual', 147000, 238000, 192500, 'Python, Bash, Go, SQL, SaaS/Cloud Troubleshooting, Cybersecurity Platforms', 'HiringCafe', 'https://hiringcafe.com/jobs/software-engineer-memphis-tn'),
(150, (SELECT company_id FROM companies WHERE company_name='Robert Half (Memphis IT Placements)'), 'Robert Half (Memphis IT Placements)', 'Cloud Engineer (Multi-Cloud IaC - Contract)', 'DevOps / Cloud / SRE', 'Senior', 'Memphis', 'TN', '38103', 'On-site', 'Onsite in Memphis, TN (Temporary / Contract)', NULL, 'Posted Nov 9, 2026', '$70 - $85/hr', 'Hourly', 145600, 176800, 161200, 'Azure, AWS, GCP, Terraform, ARM Templates, Bicep, CloudFormation, CI/CD, Cloud Security & FinOps', 'Robert Half', 'https://www.roberthalf.com/us/en/jobs/memphis-downtown-tn/all'),
(151, (SELECT company_id FROM companies WHERE company_name='Methodist Le Bonheur Healthcare'), 'Methodist Le Bonheur Healthcare', 'Unified Communications Analyst I - Mobility', 'Traditional IT', 'Entry-Mid', 'Memphis', 'TN', '38134', 'On-site', 'Methodist Le Bonheur Corporate (Memphis, TN)', '103163729984', 'Refreshed Nov 20, 2026', NULL, NULL, NULL, NULL, NULL, 'Unified Communications, Enterprise Mobility Management, Healthcare Telecom', 'Methodist Careers', 'https://careers.methodisthealth.org/job/memphis/unified-communications-analyst-i-mobility/47203/103163729984'),
(152, (SELECT company_id FROM companies WHERE company_name='Orgill, Inc.'), 'Orgill, Inc.', 'Advisor Financial Systems', 'Traditional IT', 'Senior / Advisor', 'Collierville', 'TN', '38017', 'On-site', 'Collierville HQ', NULL, 'Posted ~Nov 13, 2026 (7d ago)', NULL, NULL, NULL, NULL, NULL, 'Enterprise Financial Systems, ERP Administration, Systems Integration', 'Metaintro / Orgill', 'https://www.metaintro.com/company/orgill'),
(153, (SELECT company_id FROM companies WHERE company_name='SBase Technologies Inc.'), 'SBase Technologies Inc.', 'Software Engineer (.NET, API, SQL Server — Direct Client: ALSAC)', 'Software Development', 'Mid-Senior', 'Memphis', 'TN', '38105', 'On-site', 'Onsite Day 1 in Memphis, TN (Locals prioritized)', '5099', 'Closes Nov 21, 2026 (3:30am)', NULL, NULL, NULL, NULL, NULL, '.NET, REST APIs, SQL Server, Enterprise Fundraising Platforms', 'Handshake / SBase', 'https://app.joinhandshake.com/public/jobs/11752371');

-- --------------------------------------------------------------------------
-- STAGE 4: ADD ACTIVE-ONLY ANALYTICAL VIEWS FOR LONGITUDINAL SLICING
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_active_jobs_only;
CREATE VIEW v_active_jobs_only AS
SELECT
    j.*,
    c.parent_or_group,
    c.sector,
    c.sub_market_corridor,
    c.ats_platform
FROM job_postings j
JOIN companies c ON j.company_id = c.company_id
WHERE j.posting_status_2026 NOT LIKE 'Closed%';

DROP VIEW IF EXISTS v_active_salary_by_classification;
CREATE VIEW v_active_salary_by_classification AS
SELECT
    role_classification,
    COUNT(*) AS active_postings,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM v_active_jobs_only), 1) AS pct_of_active,
    COUNT(annual_mid_usd) AS postings_with_pay_data,
    ROUND(MIN(annual_min_usd), 0) AS lowest_advertised_usd,
    ROUND(AVG(annual_mid_usd), 0) AS avg_midpoint_usd,
    ROUND(MAX(annual_max_usd), 0) AS highest_advertised_usd
FROM v_active_jobs_only
GROUP BY role_classification
ORDER BY active_postings DESC;

COMMIT;
