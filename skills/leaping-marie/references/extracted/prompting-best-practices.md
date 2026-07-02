# Prompting best practices

<!-- source: Prompting best practices - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Calls
Powered by
Essentials
Tips and tricks
Prompting best practices
Prompt engineering is an art instead of a science. Even though prompts look like plain language (English,
German, Spanish, etc.), there is definitely a different way to prompting an AI agent than talking to a human. 
Find below a couple of prompt engineering tips and tricks that we at Leaping AI have learnt in the last 2
years:
Keep the agent setup prompt (system message) short and ideally to under 2,000 tokens. This is
important because it gets loaded at every step of the conversation. Making it too large could add latency
to the conversation.
To make the conversation more human, you can include a prompt telling the AI to add filler words
regularly, such as “umm, uhh, ok”.
Specify explicitly how certain numbers should be pronounced, giving examples as well. For example, say
“convert post codes to words, eg. 94107 # nine, four, one, zero, seven”. Not doing this will make the AI
pronounce this specific number as ninety four thousand, one hundred and seven.
Refer to transitions (aka functions) in the prompt. E.g., “call the function ‘call transfer’ if the customer
would like to speak to a human”.
Try to use steps and examples in the prompt. This will tell the AI exactly what you would like it to do.
Emphasise things using capitalisation that you want the AI agent to do. Example: “DO NOT repeat the
customer answer back to the customer and ALWAYS go to the next question”.
Be very specific about how certain things should be spelled in order for them to be spoken clearly and
slowly, e.g.,
“Convert email addresses into words and separate them by commas, e.g., ‘ ’ to
‘john, dot, doe, at, gmail, dot, com’
“Convert customer numbers into words and separate the words by commas, e.g., ‘324124’ to ‘three,
two, four, one, two, four’”
“Convert birthdays into words and separate them by commas, e.g., ‘01/04/1992’ to ‘january fourth,
nineteen ninetytwo’”
Do not rely on prompts to compare two pieces of text or to do math. LLMs are next token predictors and
give probabilistic (non-exact) output. Always leverage extra functions to do math operations.
If you have a knowledge base or Q&A that you want the agent to refer to, you can include them directly in
the prompts, assuming it doesn’t exceed the acceptable context window of the large language model.
Be ready to continuously iterate on the prompts. It is an ongoing activity even after going live that never
ends.
john.doe@gmail.com
Ask a question...
⌘I
Essentials Prompting best practices

