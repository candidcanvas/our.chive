# Personal Data

### About

Building on [prior explorations with CRUD and Image Uploads](https://github.com/ixd-system-design/Uploading-Images), this demo adds functionality for user authentication [via Auth0](https://auth0.com/) and the [Express OpenID Connect](https://github.com/auth0/express-openid-connect) library. The application uses MongoDB to persist data and to define the owner of each record. Accordingly, our [Prisma](https://www.prisma.io/orm) schema includes models for both users and cats.

Backend endpoints include the following logic:

*   Only authenticated users can create, update, or delete cat records.
*   Each cat record is associated with the user who created it.
*   Users can only modify or delete their own cat records.
*   All users can view all cat records, regardless of ownership.

Frontend interfaces reflect these options by revealing and concealing UI elements depending on the user's logged-in state, and their relationship to the data.

The pattern being used here assumes that the backend enforces the rules, while the frontend communicates those rules to the user. 

## Setup
To setup this project, we can follow the same process as for the two previous demos on which this repository is based:
1. To setup MongoDB, Prisma, and Vercel Blob, follow the same setup process as defined in the [Image Uploads](https://github.com/ixd-system-design/Uploading-Images) demo.
2. To Setup Auth0, follow the setup process defined in the [Vault](https://github.com/ixd-system-design/Vault) demo. 