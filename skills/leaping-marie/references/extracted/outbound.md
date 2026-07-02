# Outbound

<!-- source: Outbound - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Phone numbers (Telephony) Do Not Call
Powered by
Essentials
Schedule outbound calls
Outbound
Uploading leads
The Leaping AI system can be used to schedule outbound calls. To do this, simply upload a list of numbers in
a CSV. Note that the phone numbers need to be in column 1 of the CSV. Also they need to follow this format:
’+(country code)(number)’, e.g., ‘+14157916601’.
It is also possible to “inject” dynamic information, such as name of the person, address or other information.
Step 1: Create fields in the agent builder (studio) that contain the variable information. Best example is
“name” to hold the customer name.
Step 2: Reference those fields in the prompts (stage messages) using double curly brackets. Example: “Greet
the customer as {{name}}”.
Step 3: After you have uploaded your CSV, you can “map” certain columns of the CSV to their respective
fields.
Scheduling calls
All the phone numbers uploaded will appear in the Staged section. Some or all of them can be selected to be
“scheduled”. To schedule a call, you have to configure a time period in which the calls will happen. The
scheduler will then equally distribute the calls in the specified time period. We recommend specifying a large
enough time window (at most 500 calls per hour).
When scheduling, you can choose a single caller number or toggle on Use multiple phone numbers to select
several. If multiple numbers are selected, calls are distributed across them at random.
Note: currently only 500 calls maximum can be scheduled at once. Thus, if you have 1,000 leads, you have to
schedule 500 calls at a time. We are working to remove the limitation.
Daily call limit
Each agent has a Max Daily Outbound Calls setting (in the agent’s Details tab, defaults to 3). This is the
maximum number of times the same customer phone number will be called in one day. Once a phone
reaches the limit, further calls to it that day are filtered out. The day is the customer’s local calendar day, not
UTC, so the cap rolls over at the customer’s local midnight.
If a call is blocked by the cap but your schedule covers multiple days, it’s automatically retried on the next
day within your scheduled window. Calls that can’t be retried (no remaining days in the schedule, or no
schedule at all) show as Failed in the calls table.
Before scheduling, you can use the preview feature (available in the API) to see how many calls would be
filtered without actually scheduling anything.
Do Not Call filtering
Numbers on your group’s  are automatically blocked from being staged and filtered out at
scheduling time. When uploading a CSV or scheduling calls, you will see a warning showing how many
numbers were filtered by the DNC list, displayed separately from daily limit filtering.
After calls are placed
After all the calls are placed, they will either appear in the Done or Failed section. All calls in the Failed
section either were not placed due to technical reasons or landed in voicemail. One can “re-stage” all the
failed calls. Those calls will appear again in the Staged section.
Do Not Call list
Ask a question...
⌘I
Essentials Outbound

