# Phone numbers (Telephony)

<!-- source: Phone numbers (Telephony) - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

MCP servers Outbound
Powered by
Essentials
Learn how to view, purchase, import and manage your phone numbers inside Leaping.
Phone numbers (Telephony)
Telephony Overview
The Telephony section lets you manage your phone numbers.
Open Dashboard → Telephony to see a list of all numbers you own or have imported.
Phone numbers are shared per group. Only group admins can purchase or delete numbers that live in Leaping’s
Twilio account.
Phone-number table
Column What it tells you
Phone number The E.164 formatted number (+1 415…). A small “External” badge means it lives in your Twilio
account, not Leaping’s.
Label A nickname you can click to edit inline (e.g. “Support Line FR”).
Region The Leaping deployment region (e.g. eastus, sweden) that routes calls for this number.
Status • Available – not deployed yet
• Deployed – currently deployed to an agent snapshot
Deployed The snapshot label that answers this number, or “–”.
Added at Date the number was linked to your workspace.
Delete Trash icon → deletion flow (with dependency checks).
Adding a phone number
Click “Add Phone Number” to open a two-option picker:
1. Purchase new number (Leaping buys & hosts it)
2. Import existing number (you keep it in your own Twilio account)
Purchasing a new number
1. Choose Purchase new number.
2. In the modal:
Field Required Notes
Country
 Determines available inventory and compliance rules.
Group
 Number ownership. You must be an admin of that group.
3. Click Purchase Phone Number.
Leaping contacts Twilio’s API and assigns a fresh number to your workspace.
You’ll see a success toast with the exact number purchased.
Many countries (e.g. 
 France, 
 Germany, 
 South Korea) require regulatory bundles before a number can
be used. If you need numbers in a regulated market, reach out to us so we can register the necessary
documentation with Twilio on your behalf.
Importing a number from your own Twilio account
Choose Import existing number and provide:
Field Required Why we need it
Phone number SID
 Identifier starting with PN…
Label
 Friendly display name
Region
 Leaping deployment region that will handle calls
Group
 Ownership group (optional)
Account SID + Auth Token
 Credentials of the external Twilio account
Press Import Phone Number – the number appears instantly with an “External” badge.
You’re still billed by Twilio directly; Leaping only references the number.
Managing numbers
When you delete a phone number, Leaping first checks that it’s not currently deployed to an agent and has no
scheduled outbound calls. If dependencies exist, you’ll see a warning with the option to force-delete, which will
also remove any associated deployments and scheduled calls.
Connecting Calls to Our Platform
You can connect calls to our platform in two main ways:
1. Standard Telephony Forwarding
2. Direct SIP Integration (INVITE or REFER)
Option 1: Standard Telephony Forwarding
Forward calls from your telephony system to the phone number assigned in our platform.
How It Works
Restrictions
This is the simplest integration method but not the most flexible.
Option 2: SIP Integration
SIP lets you bypass the PSTN entirely and connect directly to our platform.
This reduces latency, improves reliability, and gives you more control over call flows.
SIP Advantages
SIP URI
All SIP calls (INVITE or REFER) use the same addressing format:
<your_agent’s_phone_number>@<our_domain>
Deployment Domains
Choose the domain closest to your location for lower latency. Use TLS (Port 5061) when full encryption (including
signaling, headers) is required, otherwise UDP (Port 5060) is sufficient.
Example: sip:
SIP Transport and Ports
SIP INVITE
SIP REFER (Recommended)
Custom SIP Headers
When using SIP, you can pass along additional headers to identify or tag calls.
This is useful for matching a SIP call to an API request, CRM record, or internal system.
Example:
INVITE sip:  SIP/2.0 X-Call-Identifier: abc123-session X-
Customer-ID: 98765
These headers are forwarded into our platform and can be used to correlate voice interactions with external
systems or reroute calls in your own infrastructure.
Setup Steps
1. Deploy your agent to a phone number in our platform.
2. Choose your connection method:
3. Configure your telephony system with the SIP URI, domain, and (optionally) custom headers.
4. Test the call to confirm connectivity.
FAQ
What happens to call history after deleting a number?
Call logs remain available for analytics, but the number itself disappears from every deployment.
Your telephony setup is now ready—buy, import, and assign numbers to create production-ready voice
agents in minutes!
Edit label – click the label cell, type a new name, press Enter or click elsewhere.
Deploy / change agent – open Agent Studio → Phone deploy, select the number and snapshot.
Delete – click the trash icon, follow the safety steps (number must be undeployed first).
Configure your telephony system to forward calls to the number assigned in our system.
The agent answers these calls as a regular PSTN call.
No SIP Features – Works like a normal phone call, without SIP control.
Carrier Costs – Calls traverse the PSTN, which may introduce additional per-minute charges.
Less Efficient – Adds a PSTN hop, which can increase latency compared to SIP.
Limited Flexibility – No direct call handovers (e.g., REFER), no custom headers, no direct SIP addressing.
No PSTN Hop – Calls route directly via SIP, avoiding unnecessary network transitions.
Lower Latency – Faster call setup and media paths.
Scalable – Easily handles large call volumes.
Flexible Call Control – Use SIP REFER for seamless handovers.
Secure – TLS transport available for encrypted signaling.
Custom Identifiers – Add custom SIP headers to track and match calls with API sessions.
Standards-Based – Works with most SIP trunks, SBCs, and PBX systems.
Europe (UDP): leaping-eu-udp.sip.twilio.com
Europe (TLS): leaping-eu-tls.sip.twilio.com
US (UDP): leaping-us-udp.sip.twilio.com
US (TLS): leaping-us-tls.sip.twilio.com
UDP → Port 5060
TLS → Port 5061
Send a direct INVITE to the SIP URI of the deployed agent.
Suitable for SIP trunks, SBCs, or softphones that originate calls directly.
Transfer an active call to the agent using SIP REFER.
Ideal for PBX/IVR scenarios where you want to hand over the caller mid-flow.
Establishes a direct media stream with our platform, keeping the setup clean.
Recommended for enterprise and contact-center deployments.
Standard telephony forwarding, or
SIP integration (INVITE or REFER, with REFER recommended).
+4915123456789@leaping-eu-tls.sip.twilio.com
+4915123456789@leaping-eu-tls.sip.twilio.com
Ask a question...
⌘I
Essentials Phone numbers (Telephony)

