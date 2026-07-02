# Agent builder (Studio)

<!-- source: Agent builder (Studio) - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Home area Details
Powered by
Essentials
Drag and drop builder
Agent builder (Studio)
In general, we model a conversation as a series of conversation steps. Each conversation step has its own
box or AI mini agent to instruct it in plain language.
General usage
Nodes (white boxes) can be added into the conversation canvas by dragging and dropping them from the left
side into the canvas. They can be edited by clicking on the pencil button.
Transitions (purple boxes within nodes) are used to connect different nodes with lines. Simply connect a
transition box with another node. Transitions are conditions described in plain language upon the triggering
of which the AI will go to some other part of the conversation tree. The description of a transition could be:
“customer wants to speak to a human”.
History shows past versions of the voice AI agent. If you want to restore a prior version, simply click on
history and select a prior agent version.
Fields are containers of information that can be referenced throughout the conversation. They have default
values and can be read / written to throughout the conversation.
Save button can be used to persist changes into the database.
Publish button is used make those saved changes testable. On the right side, one can press the “voice chat”
or “text chat” button to test the published voice AI agent. Before pressing Publish, make sure that all nodes
and transitions are connected.
Phone button allows deploying the changes to a phone number that was assigned to your organisation / that
you added from Twilio. If you call that phone number, you can speak to your newly created voice AI agent.
Different node types
Agent Setup
This node uses plain language to describe the overall goal of the AI agent. It should contain the role and the
task of the agent. Furthermore, general instructions on how to speak or behave can be included here. Note
that the content of this node will be loaded at every turn of the conversation.
Tip: do not include too many details of the script in this node. These details are best placed in the other
nodes coming after the start node.
Scripted
The words typed into the Scripted node will be spoken at verbatim, meaning exactly as they are typed into
the node. Scripted nodes are especially suitable for the following situations:
Dialogue
A dialogue node differs from a scripted node in that you tell the AI what its job is and not which words to say.
Plain language is used to give instructions to the AI agent in the stage message. Functions can be selected to
give the AI agent abilities to read / write data from external systems.
Transitions can be added to navigate the conversation to another conversation step.
Field setter
The field setter node can be used to set the value for certain variables manually.
Use cases:
Junction
A junction node can check the value of a certain field and depending on its value, route the conversation to
one part of the conversation tree or another.
One example is detecting at the beginning of the conversation if the call is an inbound or outbound call.
Function
Generally, functions can be used to read / write from an external data system. They can be executed within a
dialogue box or executed as part of a separate stage / node. The advantage of the latter is that the function
is executed deterministically 100% of the time.
Call Transfer
This node will initiate a call transfer to a third party. There are two options: transfer by phone number of
transfer by SIP.
In the former, you have to enter the target phone number. Note that the phone number has to have ’+(country
code)’ format before the actual phone number.
In the case of transfer by SIP, you have to enter the SIP URI and if relevant, any SIP headers, such as
conversation ids. SIP can be either SIP Invite or SIP REFER. Please talk to kevin(dot)wu(at)leapingai(dot)com
to evaluate the best possible option for your business.
End
Calls that reach the End node will be marked as Completed in the frontend. A summary will be generated for
every call, irrespective of if the call completes or gets dropped. The prompt for the summary is inside the End
node.
Post conversation
A post conversation node is the same as a function node, but it is executed after the conversation completes,
irrespective of the status of the call. An especially good use case is sending a call summary to a CRM.
Switch
Overview
The Switch node directs the conversation flow based on the value of a specific Field. It allows you to define
multiple cases for different values and route the caller accordingly.
Use Cases
For example, you can use the Switch node to route callers based on their country code. Cases might be
configured for values such as DE, US, or AU, directing the caller to the appropriate node for their country.
Default Case
If the Field value doesn’t match any of the defined cases, the Switch node will automatically use its default
case, ensuring a fallback path for any unexpected or undefined input.
Intro: Saying the same greeting to every customer at the start of the conversation
Outro: Saying the same goodbye message to every customer at the end of the conversation
Before a call transfer: Saying a standardised message before transferring the call to a human
Storing certain information that should be accessed further downstream in the conversation. Example
could be storing the intent of a customer.
Making it easier to filter exported calls. In the example in the screenshot below, we determine if a
customer is a qualified customer in a previous step and transition to a field setter node that sets the
value of the qualified field to true. As every field is its own column in the calls export, this allows for easy
filtering of qualified customers.
Detecting voicemail. Setting the field leaping_call_voicemail_detected to true will mark the status of the
call to No Answer.
Ask a question...
⌘I
Essentials Agent builder (Studio)

