// Public half of the mockup-builder key pair (RSA-3072, SPKI PEM). Safe to
// publish: it can only ENCRYPT briefs. The private half lives only in the
// "Re-Charge: build queued mockups" Routine prompt. To rotate: generate a new
// pair, replace this, redeploy build-sync + project-intake, update the Routine.
export const BUILD_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAiEoDet/XODbNVDG3MAm9
LKS8OkL9Rja8LIPI4YXzjLn86Dtv0WR8Dw8lNv4v3xeAvrF4rv8M5wV9p28lg/VU
QDGHR1A7W9x8XRumzBROL0mbVW0jwsnUGWU8kaUp0JxI/QralqS+SOzmT1pCjqjA
ChdcyDPgovzmesfvjds+Zz3Jabuw2623lmWF9xS8SqT1I59DJdHZdvTJYvAGuyvR
GgPql8ESSHjp4engRQAPGMAeRffZHVpx2a0afF06I6mD48Qn/2V9Q+YYk/RBp3eg
IuQ/MbKNZYyJ+d3LsO3vPAzfJ6Zb4RKf1C/wBstQk66L9wmtxuu6z2q9718MhcBr
2KgvRbnLZW80k8P3O5Prsb9/Xew4qcBmXi/LJACW2crY3Dy8ZH81uAGTAR1cEkyV
DQuBBv9PHNLatMm5OWqbAzItw+/fb8wOBrFa7IocHjbwnQqkcnafBoRZ7oakW6PN
RDgvoI5pXJ1OmZVY7YOC10pwxzcyFoqMlKkA/5HuHf8/AgMBAAE=
-----END PUBLIC KEY-----
`;
