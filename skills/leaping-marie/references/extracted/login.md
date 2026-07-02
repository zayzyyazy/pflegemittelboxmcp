# Login

<!-- source: Login - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Validate snapshot Get calls
Powered by
Authentication
Login
Authentication
This endpoint allows you to authenticate with the Leaping AI API and obtain an access token.
Request Format
The endpoint accepts form data with the following parameters:
Response
On successful authentication, the endpoint returns a JSON object containing:
Usage
Include the access token in the Authorization header of subsequent requests:
Common Errors
Example
Always keep your credentials and tokens secure. Do not expose them in client-side code or public repositories.
username (string, required): Your Leaping AI username
password (string, required): Your Leaping AI password
grant_type (string, optional): The OAuth grant type, defaults to “password”
scope (string, optional): The requested scope, defaults to an empty string
client_id (string, optional): The client ID, if required
client_secret (string, optional): The client secret, if required
access_token: The token to use for API authentication
token_type: The type of token (usually “bearer”)
expires_in: Token validity period in seconds
refresh_token: Token that can be used to obtain a new access token when the current one expires
400 Bad Request: If the request format is invalid
401 Unauthorized: If the credentials are incorrect
422 Unprocessable Entity: If the request body contains invalid data
Authorization: Bearer YOUR_ACCESS_TOKEN
curl -X POST "https://api.leaping.ai/v1/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=your_username&password=your_password"
Ask a question...
⌘I

