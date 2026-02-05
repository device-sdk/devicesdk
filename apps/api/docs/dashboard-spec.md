# DeviceSDK Dashboard Specification

This document describes the features and pages of the DeviceSDK user dashboard for managing IoT projects, devices, and scripts.

---

## Overview

The DeviceSDK Dashboard provides a web interface for users to manage their IoT projects and devices. It follows a similar experience to the Cloudflare Workers dashboard, where users can create projects, register devices, upload and version scripts, and monitor device connectivity.

---

## Authentication

no changes to what exists today

---

## Main Navigation

The dashboard uses a sidebar navigation with the following top-level sections:
- **Projects** - Main workspace for IoT projects
- **API Tokens** - Manage tokens for CLI and API access
- **Account** - User profile and settings

---

## Projects

### Projects List Page (`/projects`)
- **Project Cards** - Grid or list view of all user projects
  - Project name and slug
  - Description (if set)
  - Device count
  - Last updated timestamp
- **Create Project Button** - Opens project creation modal
  - the modal should some sort of wizard telling the user how to create a project with the node cli, like npx @devicesdk/cli init
- **Search/Filter** - Filter projects by name or slug
- **Empty State** - Helpful onboarding message when no projects exist

### Create Project Modal
- **Project Slug** - User-defined unique identifier (URL-safe, 1-36 chars)
- **Project Name** - Human-readable display name
- **Description** - Optional project description
- **Validation Feedback** - Real-time slug format validation

### Project Detail Page (`/projects/:projectId`)

#### Overview Tab
- **Project Info** - Name, slug, description, creation date
- **Edit Project** - Inline editing of name and description
- **Delete Project** - With confirmation dialog (destructive action)
- **Quick Stats**
  - Total devices
  - Online devices count
  - Total script deployments

#### Devices Tab
- **Devices Table/Grid**
  - Device slug/name
  - Online/offline status indicator
  - Current script version
  - Last connected timestamp
  - Actions: View, Edit, Delete
- **Add Device Button** - Opens device registration modal
  - again this should also be a wizard modal, in docs format, telling the user that they should add a new device on devicesdk.ts on their existing project, then deploy the project
  - users can also create a device from ui, but we should recommend users to use the cli
- **Empty State** - Guide for registering first device

#### Settings Tab
- **Project Slug** - Display only (immutable after creation)
- **Edit Name/Description**
- **Danger Zone**
  - Delete project (requires typing project slug to confirm)

---

## Devices

### Device Registration Modal
- **Device Slug** - User-defined identifier unique within project
- **Device Name** - Human-readable display name
- **Description** - Optional device description
- **Validation** - Slug uniqueness check within project, this validation is done in the endpoint response

### Device Detail Page (`/projects/:projectId/devices/:deviceId`)

#### Overview Tab
- **Device Info** - Name, slug, description
- **Connection Status** - Online/offline with last seen timestamp
- **Current Script** - Version ID, deployment message, upload date
- **Quick Actions**
  - Upload new script
  - View script code
  - Edit device info

#### Script Tab
- **Current Script Editor** - Read-only code viewer with syntax highlighting
- **Upload New Script**
  - Code editor with JavaScript/TypeScript syntax highlighting
  - Deployment message input
  - Script validation before upload
  - Upload button with loading state
- **Script Templates** - Dropdown to load starter templates, make the script content just a todo, i will edit that later
  - Basic Blink
  - Temperature Monitor
  - I2C Sensor Reader
  - PWM Motor Control
  - Button LED Toggle
  - GPIO Input Monitor

#### Versions Tab
- **Version History List**
  - Version ID
  - Deployment message
  - Timestamp
  - "Current" badge for active version
- **Version Actions**
  - View script code
  - Deploy (rollback to this version)
  - Compare with current version
- **Pagination** - For projects with many versions

#### Logs Tab (Future Feature)

just mark this tab as coming soon or todo or something

#### Settings Tab
- **Edit Device Info** - Name, description
- **Danger Zone**
  - Delete device (requires confirmation)

---

## Scripts

### Script Editor Features
- **Syntax Highlighting** - JavaScript/TypeScript support, optional
- **Line Numbers**
- lets keep this simple for now, and improve on a later stage

### Script Validation
- default export Class structure verification (must extend `DeviceEntrypoint`)
- Required method checks (`onMessage`)
- Size limit indicator (max 1MB)

---

## API Tokens

### API Tokens Page (`/tokens`)
- **Tokens List**
  - Token name/label
  - Creation date
  - Last used (if available)
  - Actions: Delete
- **Create Token Button**
- **Token Security Notice** - Reminder that tokens provide full API access

### Create Token Modal
- **Token Name** - Label for identification
- **Generated Token Display** - Show once, copy to clipboard
- **Security Warning** - "This token will only be shown once"
- **Copy Button** - One-click copy with confirmation

### Token Deletion
- Confirmation dialog
- Immediate revocation

---

## Account

### Profile Page (`/account`)
- **User Info**
  - Profile picture (from Google)
  - Name
  - Email address
  - Account creation date

### Settings Page (`/account/settings`)
- **Preferences** (future features)
  - Default code editor theme
  - Notification preferences
- **Danger Zone**
  - Delete account (requires confirmation)

---

## Global Features

### Header
- **Logo/Home Link** - Navigate to projects list
- **User Menu**
  - Profile picture
  - Account link
  - Logout button

### Notifications/Toasts
- Success messages (project created, script deployed, etc.)
- Error messages with details
- Auto-dismiss with manual close option

### Empty States
- Contextual illustrations and helpful text
- Call-to-action buttons (Create first project, Add first device, etc.)

### Loading States
- Skeleton loaders for data fetching
- Button loading spinners for actions
- Full-page loader for initial app load

### Error Handling
- Friendly error pages (404, 500)
- Retry options for failed requests
- Connection status indicator

### Responsive Design
- Desktop-optimized primary experience
- Tablet-friendly layouts
- Mobile support for monitoring (not script editing)
