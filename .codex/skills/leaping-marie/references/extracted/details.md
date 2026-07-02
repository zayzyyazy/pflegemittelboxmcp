# Details

<!-- source: Details - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Agent builder (Studio) Knowledge bases
Powered by
Essentials
Configure certain settings for the agent
Details
General
Here, you can give the AI agent a name and description. Other settings:
Language
Here you can choose between different text to speech and speech to text providers. We offer many
languages and voices per language. There is also the possibility to clone a voice. If this is interesting to you,
reach out to kevin(dot)wu(at)leapingai(dot)com.
If you choose Deepgram as the speech to text provider, you can configure a delay parameter. The Delay
value specifies an artificial number of milliseconds that the AI agent will wait before replying to a user input.
Best practice is 200 ms. The Speed manager option will adjust the talking speed of the voice AI agent to the
talking speed of the user. It is worth experimenting with this option.
If you choose Elevenlabs at the text to speech provider, you can configure two parameters: Stability and
Similarity. They help control the consistency of the voice. Best practice is to put both values at 0.8.
Knowledge base
You can upload CSV files with question-answer pairs that the AI agent will refer to throughout the
conversation. All files need to have two columns (one column for the question and one column for the
answer).
In general, please talk to the Leaping AI team before using knowledge bases. Currently, we recommend all
our customers putting FAQ information into the prompts / context window.
Fields
Overview
Fields are variables that store information throughout a conversation. They have a defined name,
a type (Real, Integer, Boolean, or Text), and an optional default value used when no value is assigned. They
can be set automatically (like phone number) or set explicitly within the call with a field setter node.
Why Use Fields?
Fields help maintain context across a conversation, ensuring the LLM doesn’t “forget” or misinterpret data.
They enable the agent to:
Best Practices
Functions
Overview
The Functions tab allows you to configure API calls and other custom capabilities for your agent, extending
its ability to interact with external systems and process data.
Note: The UI for this section is currently being reworked.
If your deployment uses API calls, please contact  .
Creating and Managing Functions
Go to Configure → Functions to create and manage Functions.
Each function allows your agent to read, write, or process information from external or internal services.
Function Types
Best Practices
Integrating Functions into Agent Flows
Once created, Functions can be added to any dialogue node:
Results
Here you can specify key pieces of data that you want the AI to pull out of each conversation at scale.
These can be:
Possible data types:
You have the possibility to configure an enum structure. This forces the output to be one of the possible
values in the enum.
Now in the Calls tab, every call will have a separate section listing all the results. Furthermore, the call export
will have a separate column for every result.
On Idle Message: What should the voice AI agent say if the customer is not responsive
Timeout: After how many seconds of the customer not being responsive should the On Idle Message be
delivered
Threshold: How many times should the On Idle Message be delivered until the voice AI agent hangs up.
Best practice is 3
Termination Message: What should the voice AI say before it hangs up the call
Interruption Sensitivity: Should the voice AI agent be easily interrupted or not. Choose Low if the AI
agent should ignore background noise. Choose High in cases where background noise is not a problem
and you want the AI agent to be interrupted by a single word.
Word count threshold: How many words have to be spoken by the user before the AI agent is
interrupted.
Store user inputs and relevant information.
Route conversations with junction or switch nodes.
Maintain metadata, such as conversation type (inbound/outbound) or the caller’s phone number.
Save inputs and outputs from Functions for later use.
Use descriptive names for Fields.
Choose a data type that best suits the information being stored.
Assign a sensible default value to avoid undefined behavior.
Leverage Fields for any data the agent needs to recall or utilize later in the conversation.
API Call – Perform requests to external APIs (similar to Postman).
Summarizer – Summarize conversation context (e.g., to quickly review the call topic for handovers).
Template – Format data using strings (e.g., prepend Bearer to a retrieved token).
Wait – Pause execution for a defined period (e.g., wait until the caller speaks).
Send DTMF – Transmit touch-tone signals (e.g., navigate phone queues).
Use descriptive names for Functions to clearly indicate their purpose.
Add detailed descriptions so the agent understands when and how to use them.
Always secure your API calls with appropriate authentication methods.
Extract only relevant fields from API responses for use in the conversation.
As a capability in the node (and referenced in its prompt), e.g.:
“If the caller states their birthday, call the check_birthday function to validate it”.
As a standalone node that triggers automatically when activated in the flow.
Key pieces of information, such as the email address that the user specified during the conversation
Reasons somebody is not interested in your product (if he specified why during the conversation)
If the person is going to buy your product or not.
text: output will be a string
boolean: output will be True or False
kevin.wu@leapingai.com
Ask a question...
⌘I
Essentials Details

