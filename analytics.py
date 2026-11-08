#!/usr/bin/env python3
"""
Greater Memphis IT Employers & Skills Build & Taxonomy Engine (analytics.py)
Enriches `memphis_it_jobs_2026.db` with normalized skill, corridor, and sector tables/views
for in-browser SQLite WebAssembly (`sql.js`) execution, and builds `docs/` static bundles.
"""

import argparse
import base64
import collections
import json
import re
import shutil
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "memphis_it_jobs_2026.db"
DOCS_DIR = BASE_DIR / "docs"
DOCS_DB_PATH = DOCS_DIR / "memphis_it_jobs_2026.db"
DOCS_BUNDLE_PATH = DOCS_DIR / "db_bundle.js"

# ----------------------------------------------------------------------------
# 1. CANONICAL SKILL TAXONOMY (37 Skills across 6 Categories)
# ----------------------------------------------------------------------------
SKILL_CATEGORIES = {
    "Languages & Frameworks": {
        "color": "#6366f1",
        "bg": "rgba(99, 102, 241, 0.14)",
        "icon": "code",
        "description": "Core software engineering languages, web frameworks, and systems programming."
    },
    "AI, Data & Analytics": {
        "color": "#ec4899",
        "bg": "rgba(236, 72, 153, 0.14)",
        "icon": "sparkles",
        "description": "Large language models, agentic AI, machine learning, data engineering, and BI."
    },
    "Cloud, DevOps & Hyperscale": {
        "color": "#06b6d4",
        "bg": "rgba(6, 182, 212, 0.14)",
        "icon": "cloud",
        "description": "Hyperscale GPU clusters, cloud providers, Kubernetes, IaC, and SRE observability."
    },
    "Enterprise & Industry Platforms": {
        "color": "#f59e0b",
        "bg": "rgba(245, 158, 11, 0.14)",
        "icon": "layers",
        "description": "Healthcare EHR (Epic), ERP (SAP/Oracle), CRM (Salesforce), ServiceNow, and WMS."
    },
    "Cybersecurity, Network & OT": {
        "color": "#10b981",
        "bg": "rgba(16, 185, 129, 0.14)",
        "icon": "shield",
        "description": "SOC defense, IAM, GRC/audit, enterprise routing/F5, and industrial OT/robotics."
    },
    "IT Leadership, Ops & Support": {
        "color": "#a855f7",
        "bg": "rgba(168, 85, 247, 0.14)",
        "icon": "users",
        "description": "Engineering management, Agile PMO, systems administration, and technical support."
    }
}

CANONICAL_SKILLS = [
    # Category 1: Languages & Frameworks
    {
        "id": "python",
        "name": "Python",
        "category": "Languages & Frameworks",
        "patterns": [r"\bpython\b"],
        "keywords": ["Python", "PyTorch", "Pandas", "FastAPI"]
    },
    {
        "id": "java_spring",
        "name": "Java & Spring Boot",
        "category": "Languages & Frameworks",
        "patterns": [r"\bjava\b", r"\bspring\s*boot\b", r"\bspring\s*webflux\b", r"\bjsp\b", r"\bscala\b"],
        "keywords": ["Java", "Spring Boot", "Spring WebFlux", "JSP", "Scala"]
    },
    {
        "id": "csharp_dotnet",
        "name": "C# & .NET Core",
        "category": "Languages & Frameworks",
        "patterns": [r"\bc#", r"\.net\b", r"asp\.net", r"c#\.net"],
        "keywords": ["C#", ".NET Core", "ASP.NET", ".NET 6+", ".NET Framework"]
    },
    {
        "id": "js_ts_node",
        "name": "JavaScript, TypeScript & Node",
        "category": "Languages & Frameworks",
        "patterns": [r"\bjavascript\b", r"\btypescript\b", r"\bnode\.?js\b", r"\bhtml/css\b", r"\bphp\b"],
        "keywords": ["JavaScript", "TypeScript", "Node.js", "HTML/CSS", "PHP"]
    },
    {
        "id": "react_nextjs",
        "name": "React & Next.js",
        "category": "Languages & Frameworks",
        "patterns": [r"\breact\b", r"\bnext\.?js\b"],
        "keywords": ["React", "Next.js", "Frontend"]
    },
    {
        "id": "angular",
        "name": "Angular",
        "category": "Languages & Frameworks",
        "patterns": [r"\bangular\b"],
        "keywords": ["Angular", "Angular v10+", "SPA"]
    },
    {
        "id": "systems_rust_go_cpp",
        "name": "Rust, Go & Embedded C/C++",
        "category": "Languages & Frameworks",
        "patterns": [r"\brust\b", r"\bgo\b", r"python/go", r"go/python", r"c\+\+", r"\bembedded\b", r"\brtos\b", r"\barm\s+micro", r"\bble\b"],
        "keywords": ["Rust", "Go", "C/C++", "RTOS", "ARM", "Embedded IoT"]
    },
    {
        "id": "apis_microservices",
        "name": "REST APIs, GraphQL & Microservices",
        "category": "Languages & Frameworks",
        "patterns": [r"\brest\b", r"\brestful\b", r"\bgraphql\b", r"\bmicroservices\b", r"\bwebhooks\b", r"\bapis\b", r"\bsoap\b", r"\bfull[- ]stack\b", r"\bbackend\b"],
        "keywords": ["REST APIs", "GraphQL", "Microservices", "Full-Stack", "Backend"]
    },

    # Category 2: AI, Data & Analytics
    {
        "id": "llms_agentic_ai",
        "name": "LLMs & Agentic AI",
        "category": "AI, Data & Analytics",
        "patterns": [r"\bllms?\b", r"\bagentic\s+ai\b", r"\bclaude\s+code\b", r"\brag\b", r"\bnlp\b", r"\bopenai\b", r"\bmcp\s+protocol", r"\bagent\s+orchestration\b", r"\bai[- ]assisted\b", r"\bai\s+strategy\b", r"\bai\s+implementation\b", r"\bai\s+architect", r"\bfoundation\s+models\b", r"\bapplied\s+ai\b"],
        "keywords": ["LLMs", "Agentic AI", "Claude Code", "RAG", "MCP", "OpenAI"]
    },
    {
        "id": "ml_data_science",
        "name": "Machine Learning, MLOps & AI",
        "category": "AI, Data & Analytics",
        "patterns": [r"\bmachine\s+learning\b", r"\bmlops\b", r"\btensorflow\b", r"\bedge\s+ai\b", r"\bpredictive\b", r"\bbioimage\b", r"\bstatistical\s+modeling\b", r"\bquantum\b", r"\bdata\s+scien", r"\bneuromorphic\b"],
        "keywords": ["Machine Learning", "MLOps", "Data Science", "Bioimage AI", "Quantum"]
    },
    {
        "id": "sql_databases",
        "name": "SQL & Relational Databases",
        "category": "AI, Data & Analytics",
        "patterns": [r"\bsql\b", r"\bt-sql\b", r"\bpostgresql\b", r"\bmysql\b", r"\bcosmos\s*db\b", r"\bdatabases?\b"],
        "keywords": ["SQL", "SQL Server", "PostgreSQL", "MySQL", "T-SQL", "Cosmos DB"]
    },
    {
        "id": "data_eng_kafka_spark",
        "name": "Data Engineering, Kafka & Spark",
        "category": "AI, Data & Analytics",
        "patterns": [r"\bkafka\b", r"\bspark\b", r"\bdataproc\b", r"\bdataflow\b", r"\betl\b", r"\bdata\s+engineering\b", r"\bevent-driven\b", r"\belasticsearch\b", r"\bgenomics\b", r"\bdata\s+infrastructure\b", r"\bhigh-performance\s+storage\b"],
        "keywords": ["Kafka", "Apache Spark", "ETL", "Elasticsearch", "Data Pipelines"]
    },
    {
        "id": "bi_analytics_governance",
        "name": "Power BI, Tableau & Data Governance",
        "category": "AI, Data & Analytics",
        "patterns": [r"\bpower\s*bi\b", r"\btableau\b", r"\balteryx\b", r"\bssrs\b", r"\bcrystal\s+reports\b", r"\bdata\s+governance\b", r"\bdecision\s+analytics\b", r"\bbi\b", r"\bdata\s+strategy\b"],
        "keywords": ["Power BI", "Tableau", "Alteryx", "SSRS", "Data Governance"]
    },

    # Category 3: Cloud, DevOps & Hyperscale
    {
        "id": "cloud_azure",
        "name": "Microsoft Azure",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\bazure\b", r"\baks\b", r"\bavd\b", r"\bbicep\b"],
        "keywords": ["Azure", "AKS", "Azure DevOps", "Azure Virtual Desktop", "Bicep"]
    },
    {
        "id": "cloud_gcp",
        "name": "Google Cloud (GCP)",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\bgcp\b", r"\bgoogle\s+cloud\b"],
        "keywords": ["GCP", "Dataproc", "Dataflow", "GCP IAM"]
    },
    {
        "id": "cloud_aws",
        "name": "Amazon Web Services (AWS)",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\baws\b", r"\bamazon\s+web\s+services\b"],
        "keywords": ["AWS", "Multi-Cloud", "Cloud Services"]
    },
    {
        "id": "kubernetes_containers",
        "name": "Kubernetes & Containers",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\bkubernetes\b", r"\bk8s\b", r"\bdocker\b", r"\bhelm\b", r"\brancher\b", r"\bkustomize\b", r"\baks\b", r"\bcontainer\b"],
        "keywords": ["Kubernetes", "Docker", "Helm", "AKS", "Rancher", "Containers"]
    },
    {
        "id": "terraform_iac_cicd",
        "name": "Terraform, GitOps & CI/CD",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\bterraform\b", r"\bcrossplane\b", r"\bargocd\b", r"\bflux\b", r"\bansible\b", r"\bgitops\b", r"\bgithub\s+actions\b", r"\bci/cd\b", r"\biac\b", r"\binfrastructure-as-code\b"],
        "keywords": ["Terraform", "ArgoCD", "Crossplane", "Ansible", "CI/CD", "GitOps"]
    },
    {
        "id": "linux_supercompute_dc",
        "name": "Linux, Bare-Metal GPU & Data Centers",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\blinux\b", r"\brhel\b", r"\bbare-metal\b", r"\bgpu\s+cluster", r"\bgpu\s+server", r"\bsupercomput", r"\bhprc\b", r"\bhigh\s+performance\s+(research\s+)?computing\b", r"\bresearch\s+computing\b", r"\bhyperscale\b", r"\bserver\s+hardware\b", r"\bdata\s+center\s+operations\b", r"\bdata\s+center\s+tech"],
        "keywords": ["Linux", "Bare-Metal GPU", "Supercompute", "Hyperscale Data Center", "HPRC"]
    },
    {
        "id": "cloud_platform_eng",
        "name": "Cloud & Platform Engineering",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\bcloud\s+infrastructure\b", r"\bplatform\s+engineering\b", r"\bcloud\s+operations\b", r"\bcloud\s+services\b", r"\bcloud\s+applications\b", r"\bcloud\s+engineer\b", r"\bmulti-cloud\b", r"\bcloud\s+computing\b"],
        "keywords": ["Platform Engineering", "Cloud Infrastructure", "Cloud Operations", "Multi-Cloud"]
    },
    {
        "id": "sre_observability",
        "name": "SRE & Observability (Grafana / Splunk)",
        "category": "Cloud, DevOps & Hyperscale",
        "patterns": [r"\bsre\b", r"\bsite\s+reliability\b", r"\bgrafana\b", r"\bprometheus\b", r"\bsplunk\b", r"\bnew\s+relic\b", r"\btelemetry\b", r"\bobservability\b", r"\bperformance\s+monitoring\b"],
        "keywords": ["SRE", "Grafana", "Prometheus", "Splunk", "Telemetry", "New Relic"]
    },

    # Category 4: Enterprise & Industry Platforms
    {
        "id": "epic_clinical_it",
        "name": "Epic EHR & Clinical Healthcare IT",
        "category": "Enterprise & Industry Platforms",
        "patterns": [r"\bepic\b", r"\bonecare\b", r"\bclinical\b", r"\behr\b", r"\ballscripts\b", r"\bcarelogistics\b", r"\bhl7\b", r"\bdicom\b", r"\bhealthcare\s+it\b", r"\bhealthcare\s+information\b"],
        "keywords": ["Epic Systems", "Baptist OneCare", "HL7", "DICOM", "Allscripts", "Clinical IT"]
    },
    {
        "id": "sap_erp",
        "name": "SAP (ABAP / BTP / S4HANA) & ERP",
        "category": "Enterprise & Industry Platforms",
        "patterns": [r"\bsap\b", r"\babap\b", r"\bfiori\b", r"\bs/4hana\b", r"\bariba\b", r"\binfor\s+ln\b", r"\berp\b"],
        "keywords": ["SAP ABAP", "SAP BTP", "S/4HANA", "SAP Fiori", "Infor LN", "ERP"]
    },
    {
        "id": "oracle_plsql",
        "name": "Oracle ERP, Cloud & PL/SQL",
        "category": "Enterprise & Industry Platforms",
        "patterns": [r"\boracle\b", r"\bpl/sql\b", r"\bpl-sql\b"],
        "keywords": ["Oracle ERP", "PL/SQL", "Oracle Cloud", "Oracle WMS", "Oracle HCM"]
    },
    {
        "id": "salesforce_crm",
        "name": "Salesforce, Data Cloud & Apex",
        "category": "Enterprise & Industry Platforms",
        "patterns": [r"\bsalesforce\b", r"\bapex\b"],
        "keywords": ["Salesforce", "Salesforce Data Cloud", "Apex", "CRM"]
    },
    {
        "id": "servicenow_itsm",
        "name": "ServiceNow & ITSM",
        "category": "Enterprise & Industry Platforms",
        "patterns": [r"\bservicenow\b", r"\bflow\s+designer\b", r"\bchange\s+management\b", r"\bit\s+service\s+delivery\b"],
        "keywords": ["ServiceNow", "Flow Designer", "Service Catalog", "ITSM"]
    },
    {
        "id": "wms_supply_chain",
        "name": "WMS & Supply Chain Logistics Systems",
        "category": "Enterprise & Industry Platforms",
        "patterns": [r"\bwms\b", r"\bwarehouse\s+management\b", r"\blogfire\b", r"\bedi\b", r"\bsupply\s+chain\b", r"\blogistics\b", r"\bmhe\b", r"\btelematics\b"],
        "keywords": ["WMS", "Supply Chain IT", "LogFire", "EDI", "Logistics Microservices"]
    },
    {
        "id": "workday_collab_cms",
        "name": "Workday, SharePoint, AEM & Atlassian",
        "category": "Enterprise & Industry Platforms",
        "patterns": [r"\bworkday\b", r"\bsharepoint\b", r"\badobe\s+experience\b", r"\baem\b", r"\bonbase\b", r"\bnintex\b", r"\bjira\b", r"\bconfluence\b", r"\batlassian\b", r"\bcms\b", r"\bpowerschool\b"],
        "keywords": ["Workday", "SharePoint", "Adobe AEM", "Jira/Confluence", "OnBase"]
    },

    # Category 5: Cybersecurity, Network & OT
    {
        "id": "cyber_soc_siem",
        "name": "Cybersecurity, SOC & SIEM/EDR",
        "category": "Cybersecurity, Network & OT",
        "patterns": [r"\bsiem\b", r"\bedr\b", r"\bids/ips\b", r"\bsoc\b", r"\bcyber\b", r"\bincident\s+response\b", r"\binfosec\b", r"\binformation\s+security\b", r"\binfrastructure\s+security\b", r"\bcloud\s+security\b", r"\bsecurity\s+operations\b", r"\bsecurity\s+controls\b"],
        "keywords": ["SOC", "SIEM", "EDR", "Incident Response", "Cloud Security", "CyberSecOps"]
    },
    {
        "id": "iam_identity",
        "name": "IAM, Ping Identity & Zero Trust",
        "category": "Cybersecurity, Network & OT",
        "patterns": [r"\biam\b", r"\bping\s*identity\b", r"\bpingfederate\b", r"\boauth\b", r"\bsaml\b", r"\bactive\s+directory\b", r"\baccess\s+control\b", r"\bkyverno\b", r"\bopa\b"],
        "keywords": ["IAM", "Ping Identity", "OAuth 2.0", "SAML", "Active Directory"]
    },
    {
        "id": "grc_audit_compliance",
        "name": "IT Audit, GRC, HIPAA & Clearance",
        "category": "Cybersecurity, Network & OT",
        "patterns": [r"\bit\s+audit\b", r"\bauditor\b", r"\bcobit\b", r"\bbcdr\b", r"\bdisaster\s+recovery\b", r"\bhipaa\b", r"\b21\s+cfr\b", r"\briskonnect\b", r"\bclearance\b", r"\bit\s+governance\b", r"\bregulatory\s+compliance\b", r"\brisk\s+frameworks\b"],
        "keywords": ["IT Audit", "COBIT", "BCDR", "HIPAA", "Security Clearance", "GRC"]
    },
    {
        "id": "networking_cisco_f5",
        "name": "Enterprise Networking, Cisco & F5",
        "category": "Cybersecurity, Network & OT",
        "patterns": [r"\brouting/switching\b", r"\bcisco\b", r"\bf5\b", r"\bload\s+balanc", r"\bnetwork\s+architect", r"\bnetwork\s+engineer", r"\bnetwork\s+admin", r"\bnetwork\s+security\b", r"\bnetwork\s+support\b", r"\boptical\s+fabrics\b", r"\bfiber\b", r"\blan/network\+", r"\bsdn\b", r"\bsoftware-defined\s+networking\b"],
        "keywords": ["Routing/Switching", "Cisco", "F5 BIG-IP", "Network Architecture", "Fiber/Optical"]
    },
    {
        "id": "ot_scada_plc_robotics",
        "name": "OT, SCADA, PLC & Robotics Automation",
        "category": "Cybersecurity, Network & OT",
        "patterns": [r"\boperational\s+technology\b", r"\bot\s+network", r"\bot\s+systems", r"\bscada\b", r"\bplc\b", r"\bsiemens\b", r"\brobotics\b", r"\biiot\b", r"\bsmart\s+manufacturing\b", r"\bsmart\s+grid\b", r"\bindustrial\s+controls\b", r"\bworkflow\s+automation\b", r"\bdigital\s+surgery\b"],
        "keywords": ["OT Systems", "SCADA", "Siemens PLC", "Robotics", "IIoT", "Smart Manufacturing"]
    },

    # Category 6: IT Leadership, Ops & Support
    {
        "id": "tech_leadership_arch",
        "name": "Tech Leadership & Enterprise Architecture",
        "category": "IT Leadership, Ops & Support",
        "patterns": [r"\btechnical\s+leadership\b", r"\bengineering\s+management\b", r"\bsoftware\s+leadership\b", r"\bdevelopment\s+leadership\b", r"\benterprise\s+architecture\b", r"\bsolution\s+architecture\b", r"\breference\s+architecture\b", r"\btechnology\s+roadmap\b", r"\bbusiness\s+relationship\b", r"\bvendor\s+mgmt\b", r"\bdirector\b", r"\bit\s+manager\b", r"\bsystem\s+director\b", r"\bmanager\s+it\b"],
        "keywords": ["Engineering Mgmt", "Enterprise Architecture", "IT Director", "Tech Strategy"]
    },
    {
        "id": "agile_pmo_ba",
        "name": "Agile Delivery, IT PMO & Systems Analysis",
        "category": "IT Leadership, Ops & Support",
        "patterns": [r"\bagile\b", r"\bpmo\b", r"\bproject\s+management\b", r"\bprogram\s+management\b", r"\bproduct\s+management\b", r"\bbusiness\s+analys", r"\bsystems\s+analys", r"\brequirements\b"],
        "keywords": ["Agile", "IT PMO", "Systems Analysis", "Business Analysis", "Product Mgmt"]
    },
    {
        "id": "sysadmin_windows_virtualization",
        "name": "Windows Server, Virtualization & NOC",
        "category": "IT Leadership, Ops & Support",
        "patterns": [r"\bwindows\s+server\b", r"\bsystems\s+administration\b", r"\bpowershell\b", r"\bstorage\s+administration\b", r"\bstorage\s+services\b", r"\bnoc\b", r"\bvirtualization\b", r"\bnonstop\b", r"\bmicrosoft\s+365\b"],
        "keywords": ["Windows Server", "Virtualization", "PowerShell", "NOC", "Storage Admin"]
    },
    {
        "id": "desktop_field_support",
        "name": "Desktop, Field & Help Desk IT Support",
        "category": "IT Leadership, Ops & Support",
        "patterns": [r"\bhelp\s+desk\b", r"\bdesktop\s+support\b", r"\bdeskside\b", r"\bl2\s+technical\b", r"\btier\s+1\b", r"\bcomputer\s+imaging\b", r"\bworkstation", r"\brf\s+scanners\b", r"\bperipherals\b", r"\basset\s+inventory\b", r"\bservice\s+desk\b", r"\btech\s+support\b", r"\bsupport\s+ticket\b"],
        "keywords": ["Help Desk", "Desktop Support", "Field Tech", "Imaging", "Service Desk"]
    }
]

# ----------------------------------------------------------------------------
# 2. MACRO-CORRIDOR & MACRO-SECTOR NORMALIZATION
# ----------------------------------------------------------------------------
CORRIDOR_GROUPS = [
    {
        "id": "downtown",
        "name": "Downtown Memphis & Riverfront",
        "short_name": "Downtown",
        "state": "TN",
        "map_x": 270,
        "map_y": 255,
        "color": "#6366f1",
        "match": ["downtown memphis", "123 s front", "38103", "38107", "peabody place"],
        "description": "Fortune 500 & civic hub anchored by AutoZone HQ, First Horizon, Frontdoor, Shelby County, City of Memphis & MLGW."
    },
    {
        "id": "medical_midtown_uofm",
        "name": "Medical District, Midtown & UofM",
        "short_name": "Medical / UofM",
        "state": "TN",
        "map_x": 360,
        "map_y": 240,
        "color": "#ec4899",
        "match": ["medical district", "midtown", "university district", "38152", "crosstown"],
        "description": "Biomedical AI, HPRC supercomputing, Epic clinical IT, and academic R&D anchored by St. Jude, ALSAC, Methodist, Regional One, UTHSC & UofM."
    },
    {
        "id": "east_memphis",
        "name": "East Memphis Corporate Corridor",
        "short_name": "East Memphis",
        "state": "TN",
        "map_x": 495,
        "map_y": 265,
        "color": "#06b6d4",
        "match": ["east memphis", "tournament", "humphreys", "ridgeway", "poplar", "commercial services", "38119", "38120", "downtown & east memphis"],
        "description": "Enterprise headquarters and corporate IT centers: International Paper, Baptist Memorial, Hilton Tech Ctr, Sedgwick, Raymond James & Deloitte."
    },
    {
        "id": "collierville_hackscross",
        "name": "Collierville & Hacks Cross Tech Corridor",
        "short_name": "Collierville / Hacks Cross",
        "state": "TN",
        "map_x": 665,
        "map_y": 335,
        "color": "#f59e0b",
        "match": ["collierville", "hacks cross"],
        "description": "Global logistics and enterprise hardware/retail engineering hub anchored by FedEx World Tech Center, Orgill HQ, Helena Agri & Mueller Industries."
    },
    {
        "id": "cordova_germantown_bartlett",
        "name": "Germantown, Cordova, Bartlett & Lakeland",
        "short_name": "Germantown / Cordova / NE",
        "state": "TN",
        "map_x": 585,
        "map_y": 190,
        "color": "#a855f7",
        "match": ["germantown", "cordova", "bartlett", "lakeland", "arlington", "38133", "38016", "38018"],
        "description": "Suburban REIT headquarters and surgical robotics/medtech corridor: MAA HQ, Smith+Nephew Digital Surgery, Stryker, Kele, Transnetyx & Olympus."
    },
    {
        "id": "south_metro_xai_desoto",
        "name": "South Metro & North MS (xAI / DeSoto / Byhalia)",
        "short_name": "South Metro / DeSoto MS",
        "state": "TN/MS",
        "map_x": 395,
        "map_y": 395,
        "color": "#10b981",
        "match": ["south metro", "southaven", "desoto", "olive branch", "byhalia", "horn lake", "marshall county"],
        "description": "Home to the xAI Colossus Supercluster & SpaceX operations plus high-automation logistics/manufacturing across Southaven, Olive Branch & Byhalia."
    },
    {
        "id": "south_memphis_airport_irs",
        "name": "Airport Industrial & IRS Computing Hub",
        "short_name": "Airport / IRS Hub",
        "state": "TN",
        "map_x": 355,
        "map_y": 325,
        "color": "#14b8a6",
        "match": ["airport", "38118", "38106", "airways"],
        "description": "Federal computing, medtech manufacturing, and freight hub including the IRS Enterprise Computing Center, Medtronic & Barnhart Crane."
    },
    {
        "id": "north_metro_millington",
        "name": "North Metro & Millington Defense (NSA Mid-South)",
        "short_name": "Millington / NSA Mid-South",
        "state": "TN",
        "map_x": 420,
        "map_y": 110,
        "color": "#3b82f6",
        "match": ["millington", "38053", "38127", "frayser", "north memphis", "mid-south"],
        "description": "Defense IT, federal personnel systems, and regional fiber telecom anchored by U.S. Navy CNIC HQ, Leidos, Peraton & Ritter RightFiber."
    },
    {
        "id": "regional_megaprojects",
        "name": "West Memphis (Google) & BlueOval City (Ford)",
        "short_name": "West Memphis & BlueOval",
        "state": "AR/TN",
        "map_x": 155,
        "map_y": 215,
        "color": "#f43f5e",
        "match": ["west memphis", "crittenden", "stanton", "blueoval", "haywood"],
        "description": "Multi-billion-dollar regional megasites: Google's West Memphis AR hyperscale data center campus and Ford's BlueOval City EV truck complex in Stanton, TN."
    }
]

MACRO_SECTORS = [
    {
        "id": "hyperscale_ai_cloud",
        "name": "Hyperscale AI, Space & Cloud Infra",
        "color": "#10b981",
        "keywords": ["hyperscale", "aerospace", "sovereign cloud", "vertical ai"]
    },
    {
        "id": "logistics_supply_chain",
        "name": "Global Logistics, Supply Chain & 3PL",
        "color": "#f59e0b",
        "keywords": ["logistics", "3pl", "drayage", "supply chain", "heavy lift"]
    },
    {
        "id": "healthcare_biomed",
        "name": "Healthcare Systems & Biomedical Research",
        "color": "#ec4899",
        "keywords": ["healthcare", "biomedical", "fundraising", "academic health", "pharmaceutical", "specialty pharmacy"]
    },
    {
        "id": "medtech_robotics_biotech",
        "name": "MedTech, Surgical Robotics & Biotech",
        "color": "#a855f7",
        "keywords": ["medical devices", "medical technology", "biotech", "orthobiologics", "orthodontic"]
    },
    {
        "id": "retail_ecommerce_hospitality",
        "name": "Retail, E-Commerce & Hospitality Tech",
        "color": "#6366f1",
        "keywords": ["retail", "hospitality", "omnichannel", "apparel", "footwear"]
    },
    {
        "id": "banking_fintech_insurance",
        "name": "Banking, FinTech, Insurance & REIT",
        "color": "#06b6d4",
        "keywords": ["banking", "wealth management", "financial services", "insurance", "real estate", "credit union"]
    },
    {
        "id": "manufacturing_industrial_ag",
        "name": "Manufacturing, EV, AgTech & Industrial",
        "color": "#f97316",
        "keywords": ["manufacturing", "packaging", "food", "agribusiness", "utility infrastructure", "insulation", "marine engine", "wood products", "paper", "copper", "specialty chemicals", "hvac", "electronics", "building automation", "industrial & software", "beverage"]
    },
    {
        "id": "civic_federal_defense_edu",
        "name": "Civic, Federal, Defense, Utilities & Edu",
        "color": "#3b82f6",
        "keywords": ["government", "municipal", "federal", "defense", "education", "school", "university", "utility"]
    },
    {
        "id": "consulting_telecom_services",
        "name": "IT Consulting, Telecom & Home/Field Services",
        "color": "#14b8a6",
        "keywords": ["consulting", "managed it", "staffing", "fiber", "home service", "pest control", "field services", "digital agency", "architecture, engineering"]
    }
]

# ----------------------------------------------------------------------------
# 3. CURATED SQL WORKBENCH QUERIES FOR SLICING & DICING
# ----------------------------------------------------------------------------
CURATED_SQL_QUERIES = [
    {
        "id": "skill_demand_matrix",
        "title": "Top Skills by Hiring Demand & Pay Premium",
        "category": "Skills & Stack",
        "description": "Ranks canonical technical skills across Greater Memphis by verified 2026 job postings, total hiring companies, and average advertised midpoint salary.",
        "sql": """SELECT
    skill_name AS "Skill / Domain",
    skill_category AS "Category",
    verified_job_postings AS "Verified Roles",
    hiring_companies_total AS "Hiring Employers",
    CASE WHEN avg_midpoint_salary_usd IS NOT NULL
         THEN '$' || printf('%,d', CAST(avg_midpoint_salary_usd AS INT))
         ELSE 'Unlisted' END AS "Avg Mid Salary",
    hiring_employers AS "Sample Memphis Employers"
FROM v_skill_demand
WHERE verified_job_postings > 0
ORDER BY verified_job_postings DESC, hiring_companies_total DESC
LIMIT 25;"""
    },
    {
        "id": "company_leaderboard",
        "title": "Top Memphis Tech Employers Leaderboard",
        "category": "Employers",
        "description": "Combines verified primary IT postings, estimated local tech roles, and total company-wide 2026 open requisitions.",
        "sql": """SELECT
    company_name AS "Employer",
    sector AS "Industry Sector",
    sub_market_corridor AS "Memphis Corridor",
    cataloged_primary_roles AS "Verified IT Roles",
    local_tech_roles_est AS "Est. Local Tech Roles",
    total_company_open_roles_2026 AS "Total 2026 Openings",
    CASE WHEN avg_advertised_mid_usd IS NOT NULL
         THEN '$' || printf('%,d', CAST(avg_advertised_mid_usd AS INT))
         ELSE 'N/A' END AS "Avg Advertised Pay",
    ats_platform AS "ATS Platform"
FROM v_company_leaderboard
WHERE is_watchlist_only = 0
ORDER BY local_tech_roles_est DESC, cataloged_primary_roles DESC
LIMIT 25;"""
    },
    {
        "id": "ai_supercompute_roles",
        "title": "AI, Agentic Coding & Supercompute Roles",
        "category": "Skills & Stack",
        "description": "Surfaces Memphis roles involving LLMs, Agentic AI (Claude Code), RAG, MLOps, Quantum, or GPU Supercomputing.",
        "sql": """SELECT
    company_name AS "Company",
    job_title AS "Role Title",
    role_classification AS "Classification",
    work_mode AS "Work Mode",
    COALESCE(raw_compensation, 'Not Disclosed') AS "Advertised Pay",
    tech_stack_tags AS "AI / Compute Stack"
FROM v_jobs_enriched
WHERE tech_stack_tags LIKE '%AI%'
   OR tech_stack_tags LIKE '%LLM%'
   OR tech_stack_tags LIKE '%GPU%'
   OR tech_stack_tags LIKE '%Supercomput%'
   OR tech_stack_tags LIKE '%Machine Learning%'
   OR tech_stack_tags LIKE '%Quantum%'
ORDER BY COALESCE(annual_mid_usd, 0) DESC, company_name ASC;"""
    },
    {
        "id": "salary_by_classification",
        "title": "Role Classification & Compensation Breakdown",
        "category": "Compensation",
        "description": "Built-in analytical view `v_salary_by_classification` showing volume share and salary bands across the 6 primary IT job families.",
        "sql": """SELECT
    role_classification AS "Role Classification",
    total_postings AS "Total Roles",
    pct_of_total_jobs || '%' AS "Share of Market",
    postings_with_pay_data AS "Roles w/ Pay",
    '$' || printf('%,d', CAST(lowest_advertised_usd AS INT)) AS "Min Pay",
    '$' || printf('%,d', CAST(avg_midpoint_usd AS INT)) AS "Avg Midpoint",
    '$' || printf('%,d', CAST(highest_advertised_usd AS INT)) AS "Max Pay"
FROM v_salary_by_classification;"""
    },
    {
        "id": "top_paying_postings",
        "title": "Highest-Paying Verified IT Roles ($120K+ Midpoint)",
        "category": "Compensation",
        "description": "Lists all Memphis IT postings advertising a midpoint compensation of $120,000/yr or higher, sorted by maximum advertised pay.",
        "sql": """SELECT
    company_name AS "Company",
    job_title AS "Job Title",
    seniority_level AS "Seniority",
    work_mode AS "Work Mode",
    raw_compensation AS "Advertised Pay",
    '$' || printf('%,d', CAST(annual_mid_usd AS INT)) AS "Annual Midpoint",
    tech_stack_tags AS "Key Skills"
FROM v_jobs_enriched
WHERE annual_mid_usd >= 120000
ORDER BY annual_max_usd DESC, annual_mid_usd DESC;"""
    },
    {
        "id": "residency_radius_policies",
        "title": "50-Mile Hybrid Radius & Residency Mandates",
        "category": "Work Mode & Geo",
        "description": "Surfaces employers enforcing geographic residency mandates (City of Memphis / MLGW 6-month Shelby Co. rule, FedEx 50-mile campus radius, or clearance rules).",
        "sql": """SELECT
    company_name AS "Company",
    job_title AS "Job Title",
    work_mode AS "Work Mode",
    city || ', ' || state AS "Location",
    residency_or_radius_rule AS "Residency / Radius / Onsite Policy"
FROM job_postings
WHERE residency_or_radius_rule LIKE '%50%'
   OR residency_or_radius_rule LIKE '%residency%'
   OR residency_or_radius_rule LIKE '%Clearance%'
   OR residency_or_radius_rule LIKE '%Suitability%'
   OR residency_or_radius_rule LIKE '%3 days%'
   OR residency_or_radius_rule LIKE '%quarter%'
ORDER BY company_name, work_mode;"""
    },
    {
        "id": "corridor_workmode_matrix",
        "title": "Sub-Market Corridor vs. Work Mode Matrix",
        "category": "Work Mode & Geo",
        "description": "Analytical view `v_corridor_workmode_matrix` comparing On-site, Hybrid, and Remote distributions and average salaries across Memphis sub-markets.",
        "sql": """SELECT
    sub_market_corridor AS "Sub-Market Corridor",
    total_cataloged_roles AS "Total Roles",
    onsite_roles AS "On-site",
    hybrid_roles AS "Hybrid",
    remote_roles AS "Remote",
    CASE WHEN avg_corridor_mid_salary_usd IS NOT NULL
         THEN '$' || printf('%,d', CAST(avg_corridor_mid_salary_usd AS INT))
         ELSE 'Unlisted' END AS "Avg Midpoint Pay"
FROM v_corridor_workmode_matrix
WHERE total_cataloged_roles >= 2
ORDER BY total_cataloged_roles DESC;"""
    },
    {
        "id": "healthcare_medtech_stack",
        "title": "Healthcare, Biomedical & Surgical Robotics Tech Stack",
        "category": "Sector Deep-Dives",
        "description": "Analyzes clinical IT (Epic, HL7/DICOM), genomics (Rust, HPRC), and surgical robotics (C++, Python, Cloud Imaging) across Memphis medical employers.",
        "sql": """SELECT
    company_name AS "Medical / MedTech Employer",
    sector AS "Sub-Sector",
    job_title AS "Role Title",
    work_mode AS "Work Mode",
    COALESCE(raw_compensation, 'Unlisted') AS "Compensation",
    tech_stack_tags AS "Clinical / Research / Robotics Stack"
FROM v_jobs_enriched
WHERE sector LIKE '%Health%'
   OR sector LIKE '%Medical%'
   OR sector LIKE '%Biomed%'
   OR sector LIKE '%Biotech%'
   OR sector LIKE '%Fundraising%'
ORDER BY company_name, job_id;"""
    },
    {
        "id": "ats_hunting_strategy",
        "title": "ATS Platform Breakdown for Job Seekers",
        "category": "Employers",
        "description": "Groups the 86 Memphis employers by Applicant Tracking System (Workday, Oracle Cloud HCM, Greenhouse, UltiPro) to help candidates target portal alerts.",
        "sql": """SELECT
    COALESCE(ats_platform, 'Custom / Direct') AS "ATS Platform",
    COUNT(*) AS "Employer Count",
    SUM(local_tech_roles_est) AS "Est. Local Tech Roles",
    SUM(total_company_open_roles_2026) AS "Total 2026 Company Roles",
    GROUP_CONCAT(company_name, ', ') AS "Employers Using Platform"
FROM companies
GROUP BY ats_platform
ORDER BY SUM(local_tech_roles_est) DESC, COUNT(*) DESC;"""
    },
    {
        "id": "early_career_pipeline",
        "title": "Entry-Level, Early Career & Student Tech Pipeline",
        "category": "Career Level",
        "description": "Identifies entry-level, junior, student (UMRF Ventures / UTHSC), and early-mid roles ideal for new graduates and career transitioners.",
        "sql": """SELECT
    company_name AS "Company",
    job_title AS "Role Title",
    role_classification AS "Category",
    seniority_level AS "Seniority",
    city || ', ' || state AS "Location",
    COALESCE(raw_compensation, 'Unlisted') AS "Pay",
    tech_stack_tags AS "Skills Needed"
FROM v_jobs_enriched
WHERE seniority_level LIKE '%Entry%'
   OR seniority_level LIKE '%Junior%'
   OR seniority_level LIKE '%Student%'
   OR seniority_level = 'Mid-Level'
ORDER BY seniority_level ASC, company_name ASC;"""
    },
    {
        "id": "watchlist_growth_employers",
        "title": "2026 Watchlist & High-Growth Startups (15 Employers)",
        "category": "Employers",
        "description": "Inspects the 15 watchlist enterprises (Nike, Sylvamo, Mueller Industries, McKesson) and local AI startups (MedHaul, Visalaw.ai, Neural Nexus, Optura AI).",
        "sql": """SELECT
    company_name AS "Watchlist Employer / Startup",
    sector AS "Sector",
    sub_market_corridor AS "Corridor",
    total_company_open_roles_2026 AS "2026 Open Roles",
    notes AS "Hiring & Stack Intelligence Notes"
FROM companies
WHERE is_watchlist_only = 1
ORDER BY total_company_open_roles_2026 DESC;"""
    },
    {
        "id": "benchmarks_2026",
        "title": "2026 Memphis Salary Benchmarks (Robert Half / Built In)",
        "category": "Compensation",
        "description": "Displays the 15 reference salary benchmarks for Greater Memphis IT roles from Executive (CIO/CISO) to Core Infrastructure.",
        "sql": """SELECT
    role_title AS "Benchmark Role",
    tier_category AS "Tier Category",
    '$' || printf('%,d', CAST(low_usd AS INT)) AS "25th Pct (Low)",
    '$' || printf('%,d', CAST(mid_usd AS INT)) AS "50th Pct (Midpoint)",
    '$' || printf('%,d', CAST(high_usd AS INT)) AS "75th+ Pct (High)",
    benchmark_source AS "Source"
FROM salary_benchmarks_2026
ORDER BY mid_usd DESC;"""
    }
]


def classify_corridor(corridor_str: str) -> Dict[str, Any]:
    s = (corridor_str or "").lower()
    if "downtown & east memphis" in s:
        return next(c for c in CORRIDOR_GROUPS if c["id"] == "east_memphis")
    for cg in CORRIDOR_GROUPS:
        for pat in cg["match"]:
            if pat in s:
                return cg
    return CORRIDOR_GROUPS[2]


def classify_macro_sector(sector_str: str) -> Dict[str, Any]:
    s = (sector_str or "").lower()
    for ms in MACRO_SECTORS:
        for kw in ms["keywords"]:
            if kw in s:
                return ms
    return MACRO_SECTORS[8]


def extract_skills_from_text(text: str) -> List[Dict[str, str]]:
    """Return canonical skills matched in the given text."""
    if not text:
        return []
    lower = text.lower()
    matched = []
    for skill in CANONICAL_SKILLS:
        for pat in skill["patterns"]:
            if re.search(pat, lower):
                matched.append({
                    "id": skill["id"],
                    "name": skill["name"],
                    "category": skill["category"],
                    "color": SKILL_CATEGORIES[skill["category"]]["color"]
                })
                break
    return matched


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def enrich_database() -> None:
    """
    Create normalized skill, corridor, macro-sector, and curated query tables & views
    directly inside `memphis_it_jobs_2026.db` so in-browser SQLite WebAssembly (`sql.js`)
    can query everything via SQL.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.executescript("""
        DROP VIEW IF EXISTS v_company_skill_matrix;
        DROP VIEW IF EXISTS v_skill_demand;
        DROP TABLE IF EXISTS curated_sql_queries;
        DROP TABLE IF EXISTS company_enrichment;
        DROP TABLE IF EXISTS macro_sectors;
        DROP TABLE IF EXISTS corridor_groups;
        DROP TABLE IF EXISTS job_skill_map;
        DROP TABLE IF EXISTS company_skill_map;
        DROP TABLE IF EXISTS canonical_skills;
        DROP TABLE IF EXISTS skill_categories;

        CREATE TABLE skill_categories (
            category_name TEXT PRIMARY KEY,
            color TEXT NOT NULL,
            bg TEXT NOT NULL,
            icon TEXT NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE canonical_skills (
            skill_id TEXT PRIMARY KEY,
            skill_name TEXT NOT NULL,
            skill_category TEXT NOT NULL,
            category_color TEXT NOT NULL,
            category_bg TEXT NOT NULL,
            keywords_json TEXT NOT NULL
        );

        CREATE TABLE job_skill_map (
            job_id INTEGER NOT NULL,
            company_id INTEGER NOT NULL,
            skill_id TEXT NOT NULL,
            PRIMARY KEY (job_id, skill_id)
        );

        CREATE TABLE company_skill_map (
            company_id INTEGER NOT NULL,
            company_name TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            job_count INTEGER DEFAULT 0,
            PRIMARY KEY (company_id, skill_id)
        );

        CREATE TABLE corridor_groups (
            corridor_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            short_name TEXT NOT NULL,
            state TEXT NOT NULL,
            map_x INTEGER NOT NULL,
            map_y INTEGER NOT NULL,
            color TEXT NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE macro_sectors (
            sector_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL
        );

        CREATE TABLE company_enrichment (
            company_id INTEGER PRIMARY KEY,
            corridor_group_id TEXT NOT NULL,
            corridor_group_name TEXT NOT NULL,
            corridor_short_name TEXT NOT NULL,
            macro_sector_id TEXT NOT NULL,
            macro_sector_name TEXT NOT NULL,
            macro_sector_color TEXT NOT NULL
        );

        CREATE TABLE curated_sql_queries (
            query_id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            sql_text TEXT NOT NULL
        );
    """)

    for cat_name, meta in SKILL_CATEGORIES.items():
        cur.execute(
            "INSERT INTO skill_categories VALUES (?, ?, ?, ?, ?)",
            (cat_name, meta["color"], meta["bg"], meta["icon"], meta["description"])
        )

    for sk in CANONICAL_SKILLS:
        cat_meta = SKILL_CATEGORIES[sk["category"]]
        cur.execute(
            "INSERT INTO canonical_skills VALUES (?, ?, ?, ?, ?, ?)",
            (sk["id"], sk["name"], sk["category"], cat_meta["color"], cat_meta["bg"], json.dumps(sk["keywords"]))
        )

    for cg in CORRIDOR_GROUPS:
        cur.execute(
            "INSERT INTO corridor_groups VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (cg["id"], cg["name"], cg["short_name"], cg["state"], cg["map_x"], cg["map_y"], cg["color"], cg["description"])
        )

    for ms in MACRO_SECTORS:
        cur.execute(
            "INSERT INTO macro_sectors VALUES (?, ?, ?)",
            (ms["id"], ms["name"], ms["color"])
        )

    for idx, q in enumerate(CURATED_SQL_QUERIES):
        cur.execute(
            "INSERT INTO curated_sql_queries VALUES (?, ?, ?, ?, ?, ?)",
            (q["id"], idx, q["title"], q["category"], q["description"], q["sql"])
        )

    jobs = cur.execute("SELECT job_id, company_id, job_title, tech_stack_tags FROM job_postings").fetchall()
    company_job_skill_counts: Dict[Tuple[int, str], int] = collections.Counter()

    for j in jobs:
        combined = f"{j['job_title']} , {j['tech_stack_tags'] or ''}"
        matched = extract_skills_from_text(combined)
        for m in matched:
            cur.execute(
                "INSERT OR IGNORE INTO job_skill_map (job_id, company_id, skill_id) VALUES (?, ?, ?)",
                (j["job_id"], j["company_id"], m["id"])
            )
            company_job_skill_counts[(j["company_id"], m["id"])] += 1

    companies = cur.execute("SELECT company_id, company_name, sector, sub_market_corridor, notes FROM companies").fetchall()
    for c in companies:
        cid = c["company_id"]
        cname = c["company_name"]
        cg = classify_corridor(c["sub_market_corridor"])
        ms = classify_macro_sector(c["sector"])
        cur.execute(
            "INSERT INTO company_enrichment VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cid, cg["id"], cg["name"], cg["short_name"], ms["id"], ms["name"], ms["color"])
        )

        note_skills = {m["id"] for m in extract_skills_from_text(f"{c['notes'] or ''} {c['sector'] or ''}")}
        job_skills = {sid for (comp_id, sid), cnt in company_job_skill_counts.items() if comp_id == cid and cnt > 0}
        all_sids = note_skills | job_skills
        for sid in all_sids:
            jcnt = company_job_skill_counts.get((cid, sid), 0)
            if sid in job_skills and sid in note_skills:
                stype = "Both"
            elif sid in job_skills:
                stype = "Job Posting"
            else:
                stype = "Company Intelligence"
            cur.execute(
                "INSERT OR REPLACE INTO company_skill_map (company_id, company_name, skill_id, source_type, job_count) VALUES (?, ?, ?, ?, ?)",
                (cid, cname, sid, stype, jcnt)
            )

    cur.executescript("""
        CREATE VIEW v_skill_demand AS
        SELECT
            cs.skill_id,
            cs.skill_name,
            cs.skill_category,
            COUNT(DISTINCT jsm.job_id) AS verified_job_postings,
            COUNT(DISTINCT csm.company_id) AS hiring_companies_total,
            ROUND(AVG(jp.annual_mid_usd), 0) AS avg_midpoint_salary_usd,
            ROUND(MIN(jp.annual_min_usd), 0) AS min_salary_usd,
            ROUND(MAX(jp.annual_max_usd), 0) AS max_salary_usd,
            GROUP_CONCAT(DISTINCT csm.company_name) AS hiring_employers
        FROM canonical_skills cs
        LEFT JOIN job_skill_map jsm ON cs.skill_id = jsm.skill_id
        LEFT JOIN job_postings jp ON jsm.job_id = jp.job_id
        LEFT JOIN company_skill_map csm ON cs.skill_id = csm.skill_id
        GROUP BY cs.skill_id
        ORDER BY verified_job_postings DESC, hiring_companies_total DESC;

        CREATE VIEW v_company_skill_matrix AS
        SELECT
            c.company_id,
            c.company_name,
            c.sector,
            ce.macro_sector_name,
            ce.corridor_short_name,
            cs.skill_id,
            cs.skill_name,
            cs.skill_category,
            csm.source_type,
            csm.job_count
        FROM company_skill_map csm
        JOIN companies c ON csm.company_id = c.company_id
        JOIN company_enrichment ce ON c.company_id = ce.company_id
        JOIN canonical_skills cs ON csm.skill_id = cs.skill_id
        ORDER BY c.local_tech_roles_est DESC, csm.job_count DESC;
    """)
    conn.commit()
    conn.execute("VACUUM;")
    conn.execute("ANALYZE;")
    conn.close()


def execute_safe_sql(sql_query: str) -> Dict[str, Any]:
    """Execute a read-only SQL query against `memphis_it_jobs_2026.db` safely."""
    cleaned = (sql_query or "").strip()
    if not cleaned:
        return {"error": "SQL query cannot be empty."}

    first_word = re.split(r"\s+", cleaned.lstrip("(-/"))[0].upper() if cleaned else ""
    if first_word not in ("SELECT", "WITH", "PRAGMA", "EXPLAIN"):
        return {"error": "Only read-only SELECT / WITH / EXPLAIN queries are permitted."}

    try:
        uri = f"file:{DB_PATH}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        cur = conn.cursor()
        cur.execute(cleaned)
        columns = [desc[0] for desc in cur.description] if cur.description else []
        rows = cur.fetchmany(500)
        conn.close()
        return {
            "columns": columns,
            "rows": [list(r) for r in rows],
            "row_count": len(rows)
        }
    except Exception as exc:
        return {"error": str(exc)}


def build_full_dataset() -> Dict[str, Any]:
    """Build the complete enriched dataset payload from `memphis_it_jobs_2026.db`."""
    conn = get_connection()
    cur = conn.cursor()

    raw_companies = [dict(r) for r in cur.execute("SELECT * FROM companies ORDER BY is_watchlist_only ASC, local_tech_roles_est DESC, company_name ASC")]
    raw_jobs = [dict(r) for r in cur.execute("SELECT * FROM v_jobs_enriched ORDER BY job_id ASC")]
    benchmarks = [dict(r) for r in cur.execute("SELECT * FROM salary_benchmarks_2026 ORDER BY mid_usd DESC")]
    salary_by_class = [dict(r) for r in cur.execute("SELECT * FROM v_salary_by_classification")]
    corridor_matrix = [dict(r) for r in cur.execute("SELECT * FROM v_corridor_workmode_matrix")]
    leaderboard = [dict(r) for r in cur.execute("SELECT * FROM v_company_leaderboard")]

    conn.close()

    company_by_name: Dict[str, Dict[str, Any]] = {}
    for c in raw_companies:
        corridor_info = classify_corridor(c["sub_market_corridor"])
        sector_info = classify_macro_sector(c["sector"])
        c["corridor_group_id"] = corridor_info["id"]
        c["corridor_group_name"] = corridor_info["name"]
        c["corridor_short_name"] = corridor_info["short_name"]
        c["macro_sector_id"] = sector_info["id"]
        c["macro_sector_name"] = sector_info["name"]
        c["macro_sector_color"] = sector_info["color"]
        c["jobs"] = []
        c["skills_map"] = {}
        c["work_modes"] = collections.Counter()
        c["raw_tags_counter"] = collections.Counter()
        for sk in extract_skills_from_text(f"{c.get('notes', '')} {c.get('sector', '')}"):
            c["skills_map"][sk["id"]] = {
                "id": sk["id"],
                "name": sk["name"],
                "category": sk["category"],
                "color": sk["color"],
                "job_count": 0,
                "from_notes": True
            }
        company_by_name[c["company_name"]] = c

    skill_stats: Dict[str, Dict[str, Any]] = {}
    for sk in CANONICAL_SKILLS:
        cat = sk["category"]
        skill_stats[sk["id"]] = {
            "id": sk["id"],
            "name": sk["name"],
            "category": cat,
            "color": SKILL_CATEGORIES[cat]["color"],
            "bg": SKILL_CATEGORIES[cat]["bg"],
            "keywords": sk["keywords"],
            "job_ids": [],
            "companies_active": set(),
            "companies_all": set(),
            "salaries": [],
            "min_salaries": [],
            "max_salaries": [],
            "work_modes": collections.Counter(),
            "classifications": collections.Counter(),
            "seniorities": collections.Counter(),
            "raw_tags": collections.Counter(),
            "co_skills": collections.Counter()
        }

    for c in raw_companies:
        for sid in c["skills_map"]:
            skill_stats[sid]["companies_all"].add(c["company_name"])

    for j in raw_jobs:
        cname = j["company_name"]
        comp = company_by_name.get(cname)
        corridor_info = classify_corridor(j["sub_market_corridor"])
        sector_info = classify_macro_sector(j["sector"])
        j["corridor_group_id"] = corridor_info["id"]
        j["corridor_group_name"] = corridor_info["name"]
        j["corridor_short_name"] = corridor_info["short_name"]
        j["macro_sector_id"] = sector_info["id"]
        j["macro_sector_name"] = sector_info["name"]
        j["macro_sector_color"] = sector_info["color"]

        raw_tag_list = [t.strip() for t in (j.get("tech_stack_tags") or "").split(",") if t.strip()]
        j["raw_tag_list"] = raw_tag_list

        matched_skills = extract_skills_from_text(f"{j['job_title']} , {j.get('tech_stack_tags') or ''}")
        j["canonical_skills"] = matched_skills
        j["skill_ids"] = [m["id"] for m in matched_skills]

        if comp:
            comp["jobs"].append({
                "job_id": j["job_id"],
                "job_title": j["job_title"],
                "role_classification": j["role_classification"],
                "seniority_level": j["seniority_level"],
                "work_mode": j["work_mode"],
                "city": j["city"],
                "state": j["state"],
                "raw_compensation": j["raw_compensation"],
                "annual_mid_usd": j["annual_mid_usd"],
                "annual_min_usd": j["annual_min_usd"],
                "annual_max_usd": j["annual_max_usd"],
                "tech_stack_tags": j["tech_stack_tags"],
                "skill_ids": j["skill_ids"],
                "source_url": j["source_url"],
                "posting_status_2026": j["posting_status_2026"],
                "residency_or_radius_rule": j["residency_or_radius_rule"]
            })
            comp["work_modes"][j["work_mode"]] += 1
            for rt in raw_tag_list:
                comp["raw_tags_counter"][rt] += 1
            for m in matched_skills:
                sid = m["id"]
                if sid not in comp["skills_map"]:
                    comp["skills_map"][sid] = {
                        "id": sid,
                        "name": m["name"],
                        "category": m["category"],
                        "color": m["color"],
                        "job_count": 0,
                        "from_notes": False
                    }
                comp["skills_map"][sid]["job_count"] += 1

        for m in matched_skills:
            st = skill_stats[m["id"]]
            st["job_ids"].append(j["job_id"])
            st["companies_active"].add(cname)
            st["companies_all"].add(cname)
            st["work_modes"][j["work_mode"]] += 1
            st["classifications"][j["role_classification"]] += 1
            st["seniorities"][j["seniority_level"]] += 1
            if j["annual_mid_usd"] is not None:
                st["salaries"].append(j["annual_mid_usd"])
                st["min_salaries"].append(j["annual_min_usd"])
                st["max_salaries"].append(j["annual_max_usd"])
            for rt in raw_tag_list:
                st["raw_tags"][rt] += 1
            for m2 in matched_skills:
                if m2["id"] != m["id"]:
                    st["co_skills"][m2["id"]] += 1

    enriched_companies = []
    for c in raw_companies:
        skills_list = sorted(
            c["skills_map"].values(),
            key=lambda x: (-x["job_count"], x["name"])
        )
        c["skills"] = skills_list
        c["skill_ids"] = [s["id"] for s in skills_list]
        c["work_modes"] = dict(c["work_modes"])
        c["top_raw_tags"] = [k for k, _ in c["raw_tags_counter"].most_common(12)]
        del c["skills_map"]
        del c["raw_tags_counter"]
        salaries = [j["annual_mid_usd"] for j in c["jobs"] if j["annual_mid_usd"] is not None]
        c["avg_mid_usd"] = round(sum(salaries) / len(salaries)) if salaries else None
        c["min_usd"] = round(min(j["annual_min_usd"] for j in c["jobs"] if j["annual_min_usd"] is not None)) if salaries else None
        c["max_usd"] = round(max(j["annual_max_usd"] for j in c["jobs"] if j["annual_max_usd"] is not None)) if salaries else None
        c["cataloged_jobs_count"] = len(c["jobs"])
        enriched_companies.append(c)

    enriched_skills = []
    for sid, st in skill_stats.items():
        sals = st["salaries"]
        avg_sal = round(sum(sals) / len(sals)) if sals else None
        min_sal = round(min(st["min_salaries"])) if st["min_salaries"] else None
        max_sal = round(max(st["max_salaries"])) if st["max_salaries"] else None

        comp_breakdown = []
        for cname in sorted(st["companies_all"]):
            comp_obj = company_by_name[cname]
            j_cnt = sum(1 for j in comp_obj["jobs"] if sid in j["skill_ids"])
            comp_breakdown.append({
                "company_id": comp_obj["company_id"],
                "company_name": cname,
                "sector": comp_obj["sector"],
                "macro_sector_name": comp_obj["macro_sector_name"],
                "corridor_short_name": comp_obj["corridor_short_name"],
                "job_count": j_cnt,
                "local_tech_roles_est": comp_obj["local_tech_roles_est"],
                "is_watchlist_only": comp_obj["is_watchlist_only"],
                "career_portal_url": comp_obj["career_portal_url"]
            })
        comp_breakdown.sort(key=lambda x: (-x["job_count"], -x["local_tech_roles_est"], x["company_name"]))

        co_list = [
            {
                "skill_id": co_id,
                "skill_name": skill_stats[co_id]["name"],
                "color": skill_stats[co_id]["color"],
                "count": cnt
            }
            for co_id, cnt in st["co_skills"].most_common(8)
        ]

        enriched_skills.append({
            "id": sid,
            "name": st["name"],
            "category": st["category"],
            "color": st["color"],
            "bg": st["bg"],
            "keywords": st["keywords"],
            "job_count": len(st["job_ids"]),
            "job_ids": st["job_ids"],
            "active_company_count": len(st["companies_active"]),
            "total_company_count": len(st["companies_all"]),
            "companies": comp_breakdown,
            "avg_salary_usd": avg_sal,
            "min_salary_usd": min_sal,
            "max_salary_usd": max_sal,
            "pay_sample_size": len(sals),
            "work_modes": dict(st["work_modes"]),
            "classifications": dict(st["classifications"]),
            "seniorities": dict(st["seniorities"]),
            "top_raw_tags": [{"tag": k, "count": v} for k, v in st["raw_tags"].most_common(12)],
            "co_occurring_skills": co_list
        })

    enriched_skills.sort(key=lambda x: (-x["job_count"], -x["total_company_count"], x["name"]))

    corridor_summaries = []
    for cg in CORRIDOR_GROUPS:
        cid = cg["id"]
        c_comps = [c for c in enriched_companies if c["corridor_group_id"] == cid]
        c_jobs = [j for j in raw_jobs if j["corridor_group_id"] == cid]
        c_sals = [j["annual_mid_usd"] for j in c_jobs if j["annual_mid_usd"] is not None]
        wm_counts = collections.Counter(j["work_mode"] for j in c_jobs)
        sk_counts = collections.Counter()
        for j in c_jobs:
            for sid in j["skill_ids"]:
                sk_counts[sid] += 1
        top_skills = [
            {
                "id": sid,
                "name": skill_stats[sid]["name"],
                "color": skill_stats[sid]["color"],
                "count": cnt
            }
            for sid, cnt in sk_counts.most_common(8)
        ]
        corridor_summaries.append({
            **cg,
            "company_count": len(c_comps),
            "active_company_count": sum(1 for c in c_comps if not c["is_watchlist_only"]),
            "watchlist_company_count": sum(1 for c in c_comps if c["is_watchlist_only"]),
            "job_count": len(c_jobs),
            "local_tech_roles_est": sum(c["local_tech_roles_est"] or 0 for c in c_comps),
            "total_open_roles_2026": sum(c["total_company_open_roles_2026"] or 0 for c in c_comps),
            "avg_salary_usd": round(sum(c_sals) / len(c_sals)) if c_sals else None,
            "work_modes": {
                "On-site": wm_counts.get("On-site", 0),
                "Hybrid": wm_counts.get("Hybrid", 0),
                "Remote": wm_counts.get("Remote", 0)
            },
            "top_skills": top_skills,
            "top_employers": [
                {
                    "company_name": c["company_name"],
                    "local_tech_roles_est": c["local_tech_roles_est"],
                    "cataloged_jobs_count": c["cataloged_jobs_count"],
                    "is_watchlist_only": c["is_watchlist_only"]
                }
                for c in sorted(c_comps, key=lambda x: (-x["local_tech_roles_est"], -x["cataloged_jobs_count"]))[:8]
            ]
        })

    sector_summaries = []
    for ms in MACRO_SECTORS:
        mid = ms["id"]
        s_comps = [c for c in enriched_companies if c["macro_sector_id"] == mid]
        s_jobs = [j for j in raw_jobs if j["macro_sector_id"] == mid]
        s_sals = [j["annual_mid_usd"] for j in s_jobs if j["annual_mid_usd"] is not None]
        sk_counts = collections.Counter()
        for j in s_jobs:
            for sid in j["skill_ids"]:
                sk_counts[sid] += 1
        sector_summaries.append({
            **ms,
            "company_count": len(s_comps),
            "job_count": len(s_jobs),
            "local_tech_roles_est": sum(c["local_tech_roles_est"] or 0 for c in s_comps),
            "total_open_roles_2026": sum(c["total_company_open_roles_2026"] or 0 for c in s_comps),
            "avg_salary_usd": round(sum(s_sals) / len(s_sals)) if s_sals else None,
            "top_skills": [
                {"id": sid, "name": skill_stats[sid]["name"], "color": skill_stats[sid]["color"], "count": cnt}
                for sid, cnt in sk_counts.most_common(6)
            ],
            "companies": [
                {
                    "company_id": c["company_id"],
                    "company_name": c["company_name"],
                    "local_tech_roles_est": c["local_tech_roles_est"],
                    "cataloged_jobs_count": c["cataloged_jobs_count"],
                    "total_company_open_roles_2026": c["total_company_open_roles_2026"],
                    "is_watchlist_only": c["is_watchlist_only"]
                }
                for c in sorted(s_comps, key=lambda x: (x["is_watchlist_only"], -x["local_tech_roles_est"], -x["cataloged_jobs_count"]))
            ]
        })
    sector_summaries.sort(key=lambda x: (-x["local_tech_roles_est"], -x["job_count"]))

    all_mid_salaries = sorted(j["annual_mid_usd"] for j in raw_jobs if j["annual_mid_usd"] is not None)
    median_salary = all_mid_salaries[len(all_mid_salaries) // 2] if all_mid_salaries else 0
    mean_salary = round(sum(all_mid_salaries) / len(all_mid_salaries)) if all_mid_salaries else 0

    kpis = {
        "total_companies": len(enriched_companies),
        "active_companies": sum(1 for c in enriched_companies if not c["is_watchlist_only"]),
        "watchlist_companies": sum(1 for c in enriched_companies if c["is_watchlist_only"]),
        "total_jobs": len(raw_jobs),
        "jobs_with_salary": len(all_mid_salaries),
        "local_tech_roles_est": sum(c["local_tech_roles_est"] or 0 for c in enriched_companies),
        "total_company_open_roles": sum(c["total_company_open_roles_2026"] or 0 for c in enriched_companies),
        "median_salary_usd": round(median_salary),
        "mean_salary_usd": mean_salary,
        "min_salary_usd": round(min(j["annual_min_usd"] for j in raw_jobs if j["annual_min_usd"] is not None)),
        "max_salary_usd": round(max(j["annual_max_usd"] for j in raw_jobs if j["annual_max_usd"] is not None)),
        "total_canonical_skills": len(enriched_skills),
        "work_modes": dict(collections.Counter(j["work_mode"] for j in raw_jobs))
    }

    curated_with_results = []
    for q in CURATED_SQL_QUERIES:
        res = execute_safe_sql(q["sql"])
        curated_with_results.append({**q, "precomputed": res})

    return {
        "kpis": kpis,
        "skill_categories": SKILL_CATEGORIES,
        "skills": enriched_skills,
        "companies": enriched_companies,
        "jobs": raw_jobs,
        "corridors": corridor_summaries,
        "sectors": sector_summaries,
        "benchmarks": benchmarks,
        "views": {
            "salary_by_classification": salary_by_class,
            "corridor_workmode_matrix": corridor_matrix,
            "company_leaderboard": leaderboard
        },
        "curated_queries": curated_with_results
    }


def bundle_docs() -> Dict[str, Any]:
    """
    Copy `memphis_it_jobs_2026.db` into `docs/memphis_it_jobs_2026.db` for SQLite WebAssembly
    AND generate `docs/db_bundle.js` containing both `window.MEMPHIS_DB_BASE64` (raw SQLite bytes)
    and `window.MEMPHIS_STATIC_DATA` (pre-hydrated dataset).
    """
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(DB_PATH, DOCS_DB_PATH)

    db_bytes = DB_PATH.read_bytes()
    db_b64 = base64.b64encode(db_bytes).decode("ascii")
    data = build_full_dataset()

    js_lines = [
        "// Auto-generated by `make build` (analytics.py). Do not edit manually.",
        f"window.MEMPHIS_DB_SIZE_BYTES = {len(db_bytes)};",
        f'window.MEMPHIS_DB_BASE64 = "{db_b64}";',
        "window.MEMPHIS_STATIC_DATA = " + json.dumps(data, ensure_ascii=False) + ";",
        ""
    ]
    DOCS_BUNDLE_PATH.write_text("\n".join(js_lines), encoding="utf-8")
    return data


def verify_build() -> None:
    """Verify database integrity, skill taxonomy coverage, and static `docs/` assets."""
    required_files = [
        DB_PATH,
        DOCS_DB_PATH,
        DOCS_BUNDLE_PATH,
        DOCS_DIR / "index.html",
        DOCS_DIR / "styles.css",
        DOCS_DIR / "charts.js",
        DOCS_DIR / "app.js"
    ]
    for rf in required_files:
        if not rf.exists() or rf.stat().st_size == 0:
            raise RuntimeError(f"Missing or empty build artifact: {rf}")

    data = build_full_dataset()
    assert data["kpis"]["total_companies"] == 86, "Expected 86 companies"
    assert data["kpis"]["total_jobs"] == 118, "Expected 118 job postings"
    assert len(data["skills"]) == 37, "Expected 37 canonical skills"
    unmatched = [j for j in data["jobs"] if not j["canonical_skills"]]
    assert len(unmatched) == 0, f"Found {len(unmatched)} jobs without canonical skills"

    for q in CURATED_SQL_QUERIES:
        res = execute_safe_sql(q["sql"])
        assert "error" not in res, f"Query {q['id']} failed: {res.get('error')}"
        assert res["row_count"] > 0, f"Query {q['id']} returned 0 rows"

    print(f"✓ Verified SQLite DB ({DOCS_DB_PATH.stat().st_size:,} bytes), 86 companies, 118 jobs, 37 skills, and 12 SQL slices in docs/.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build & verify MEMployers 2026 SQLite WASM & docs/ artifacts.")
    parser.add_argument("--enrich-db", action="store_true", help="Enrich memphis_it_jobs_2026.db with skill & corridor tables/views.")
    parser.add_argument("--bundle-docs", action="store_true", help="Copy .db and write db_bundle.js into docs/.")
    parser.add_argument("--verify", action="store_true", help="Verify all database tables, SQL queries, and docs/ files.")
    args = parser.parse_args()

    if not (args.enrich_db or args.bundle_docs or args.verify):
        # Default: run full build + verify
        enrich_database()
        bundle_docs()
        verify_build()
        return

    if args.enrich_db:
        enrich_database()
        print("✓ Enriched memphis_it_jobs_2026.db with normalized skill, corridor, and sector tables & views.")
    if args.bundle_docs:
        bundle_docs()
        print(f"✓ Generated docs/memphis_it_jobs_2026.db and docs/db_bundle.js ({DOCS_BUNDLE_PATH.stat().st_size:,} bytes).")
    if args.verify:
        verify_build()


if __name__ == "__main__":
    main()
