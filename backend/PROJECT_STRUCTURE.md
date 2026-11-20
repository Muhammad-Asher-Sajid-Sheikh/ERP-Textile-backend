# Backend structure

See [README.md](./README.md#architecture) for the current architecture and [package.json](./package.json) for commands.

HTTP registration is in [src/routes/](./src/routes/); controllers in [src/controllers/](./src/controllers/) parse input and shape responses. Business transactions live in [src/services/](./src/services/). Validation, live authentication, authorization and centralized errors are separate concerns. Every persistence consumer imports [src/lib/prisma.ts](./src/lib/prisma.ts).

[src/app.ts](./src/app.ts) exports the Express application. [src/server.ts](./src/server.ts) owns startup and shutdown. TypeScript NodeNext sources compile to `dist/`; Prisma-generated TypeScript is regenerated during development/build and is not versioned. The obsolete tutorial script referencing removed Post records was removed. The unmounted Merchandising product-list helper remains under [src/controller/](./src/controller/) for compatibility.

[prisma/schema.prisma](./prisma/schema.prisma) defines auth, existing Merchandising structures, Customer/CustomerContact/CustomerRelationship, Inquiry, InquiryEvidence, InquiryAcknowledgement, InquiryStatusHistory, IrnSequence and BusinessAuditLog. [prisma/migrations/](./prisma/migrations/) preserves applied history and adds forward migrations only.
