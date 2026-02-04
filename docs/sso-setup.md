# SSO/SAML Setup Guide

This guide explains how to configure Single Sign-On (SSO) using SAML 2.0 for enterprise authentication in Seizn.

## Overview

Seizn supports SAML 2.0 for enterprise SSO, allowing organizations to use their existing Identity Provider (IdP) for authentication. Supported IdPs include:

- Okta
- Azure AD (Microsoft Entra ID)
- Google Workspace
- OneLogin
- Auth0
- PingFederate
- Any SAML 2.0 compliant IdP

## Prerequisites

- **Enterprise plan** subscription (SSO is an enterprise feature)
- Admin access to your organization in Seizn
- Admin access to your Identity Provider (IdP)
- Verified ownership of your email domain

## Setup Process

### Step 1: Verify Your Domain

Before configuring SSO, you must verify ownership of your email domain(s).

1. Navigate to **Settings > SSO > Domains** in your organization settings
2. Click **Add Domain**
3. Enter your domain (e.g., `example.com`)
4. Choose a verification method:
   - **DNS TXT** (recommended): Add a TXT record to your DNS
   - **DNS CNAME**: Add a CNAME record
   - **Meta tag**: Add a meta tag to your website
   - **File**: Upload a verification file

Example DNS TXT record:
```
Host: _seizn-verification.example.com
Type: TXT
Value: seizn-verify=<verification-token>
```

5. Click **Verify** once the DNS changes have propagated (may take up to 48 hours)

### Step 2: Create SSO Connection

1. Go to **Settings > SSO > Connections**
2. Click **New Connection**
3. Enter a name for the connection (e.g., "Corporate SSO")
4. Select provider type: **SAML** or **OIDC**

### Step 3: Configure Your IdP

Download the Seizn SP (Service Provider) metadata from your connection settings, or use these values:

| Setting | Value |
|---------|-------|
| SP Entity ID | `https://www.seizn.com/api/sso/saml/{org-slug}/metadata` |
| ACS URL | `https://www.seizn.com/api/sso/saml/{org-slug}/acs` |
| NameID Format | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |

Replace `{org-slug}` with your organization's slug.

#### IdP Configuration Examples

<details>
<summary><strong>Okta</strong></summary>

1. In Okta Admin Console, go to **Applications > Create App Integration**
2. Select **SAML 2.0**
3. Configure:
   - App name: `Seizn`
   - Single sign-on URL: `https://www.seizn.com/api/sso/saml/{org-slug}/acs`
   - Audience URI: `https://www.seizn.com/api/sso/saml/{org-slug}/metadata`
   - Name ID format: `EmailAddress`
4. Add attribute statements:
   | Name | Value |
   |------|-------|
   | email | user.email |
   | firstName | user.firstName |
   | lastName | user.lastName |
5. Download the IdP metadata XML or copy the values

</details>

<details>
<summary><strong>Azure AD (Microsoft Entra ID)</strong></summary>

1. In Azure Portal, go to **Azure Active Directory > Enterprise applications**
2. Click **New application > Create your own application**
3. Select **Integrate any other application (Non-gallery)**
4. Go to **Single sign-on > SAML**
5. Configure Basic SAML Configuration:
   - Identifier: `https://www.seizn.com/api/sso/saml/{org-slug}/metadata`
   - Reply URL: `https://www.seizn.com/api/sso/saml/{org-slug}/acs`
6. Download the Federation Metadata XML

</details>

<details>
<summary><strong>Google Workspace</strong></summary>

1. In Google Admin Console, go to **Apps > Web and mobile apps**
2. Click **Add app > Add custom SAML app**
3. Configure:
   - ACS URL: `https://www.seizn.com/api/sso/saml/{org-slug}/acs`
   - Entity ID: `https://www.seizn.com/api/sso/saml/{org-slug}/metadata`
   - Name ID: Primary email
4. Add attribute mappings as needed
5. Download the IdP metadata

</details>

### Step 4: Configure Seizn SSO Connection

After configuring your IdP, enter the IdP settings in Seizn:

1. Go back to your SSO connection in Seizn
2. Enter the IdP configuration:
   - **Entity ID**: Your IdP's Entity ID
   - **SSO URL**: IdP's Single Sign-On URL
   - **Certificate**: IdP's X.509 Certificate (PEM format)
3. Configure attribute mapping if needed:
   ```json
   {
     "email": "email",
     "firstName": "first_name",
     "lastName": "last_name",
     "displayName": "display_name"
   }
   ```
4. Add your verified domain(s) to the connection
5. Click **Save**

### Step 5: Test the Connection

1. Change the connection status to **Testing**
2. Click **Test Connection** or use the test URL
3. Complete the authentication flow
4. Verify user attributes are mapped correctly

### Step 6: Activate SSO

Once testing is successful:

1. Change the connection status to **Active**
2. Optionally enable **Enforce SSO** to require all users to use SSO

## API Reference

### List SSO Connections

```http
GET /api/organizations/{orgId}/sso
Authorization: Bearer <token>
```

### Create SSO Connection

```http
POST /api/organizations/{orgId}/sso
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Corporate SSO",
  "providerType": "saml"
}
```

### Update SSO Connection

```http
PATCH /api/organizations/{orgId}/sso/{connectionId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "active",
  "entityId": "https://idp.example.com/saml",
  "ssoUrl": "https://idp.example.com/sso",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "emailDomains": ["example.com"]
}
```

### Initiate SSO Login

```http
POST /api/sso/initiate
Content-Type: application/json

{
  "email": "user@example.com",
  "relayState": "/dashboard"
}
```

Response:
```json
{
  "success": true,
  "redirectUrl": "https://idp.example.com/sso?SAMLRequest=...",
  "requestId": "_abc123"
}
```

### Domain Verification

```http
POST /api/organizations/{orgId}/sso/domains
Authorization: Bearer <token>
Content-Type: application/json

{
  "domain": "example.com",
  "method": "dns_txt"
}
```

## Settings Reference

### Connection Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `allowIdpInitiated` | Allow IdP-initiated SSO | `true` |
| `forceAuthn` | Force re-authentication each login | `false` |
| `signRequest` | Sign SAML AuthnRequest | `true` |
| `wantAssertionsSigned` | Require signed assertions | `true` |
| `defaultRole` | Role for new users | `member` |
| `autoProvision` | Auto-create users on first login | `true` |
| `jitProvisioning` | Just-In-Time provisioning | `true` |

### Attribute Mapping

| Seizn Attribute | Description | Example IdP Attribute |
|-----------------|-------------|----------------------|
| `email` | User's email (required) | `email`, `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` |
| `firstName` | First name | `firstName`, `givenName` |
| `lastName` | Last name | `lastName`, `surname` |
| `displayName` | Display name | `displayName`, `name` |
| `groups` | Group memberships | `groups`, `memberOf` |

## Troubleshooting

### Common Issues

**"SAML response validation failed"**
- Check that the IdP certificate is correctly configured
- Verify the clock is synchronized (SAML assertions are time-sensitive)
- Check the NameID format matches

**"Domain not verified"**
- Ensure DNS changes have propagated (check with `dig` or online DNS tools)
- Verify the TXT record value exactly matches the verification token

**"User not provisioned"**
- Check that `autoProvision` is enabled
- Verify the email attribute is correctly mapped

### Debug Mode

Enable debug logging for SSO by setting:
```
SSO_DEBUG=true
```

This will log detailed SAML request/response information.

## Security Considerations

1. **Certificate Rotation**: Plan for IdP certificate rotation before expiry
2. **Enforce SSO**: Consider enforcing SSO for all org members once verified
3. **Session Management**: SSO sessions are tracked for single logout support
4. **Audit Logs**: All SSO login attempts are logged in the audit trail

## Implementation Status

> **Note**: Full SAML response processing requires additional packages. The current implementation provides:
> - SSO connection configuration and management
> - Domain verification
> - SP metadata generation
> - SAML request generation (placeholder)
> - SAML response endpoint structure
>
> To complete the implementation, install one of:
> - `@node-saml/node-saml`
> - `@boxyhq/saml-jackson`
> - `samlify`

## Support

For SSO configuration assistance:
- Email: support@seizn.com
- Documentation: https://www.seizn.com/docs/sso
