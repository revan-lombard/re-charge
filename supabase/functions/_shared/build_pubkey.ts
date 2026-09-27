// Public half of the mockup-builder key pair (RSA-3072, SPKI PEM). Safe to
// publish: it can only ENCRYPT briefs. The private half lives only in the
// "Re-Charge: build queued mockups" Routine prompt. To rotate: generate a new
// pair, replace this, redeploy build-sync + project-intake, update the Routine.
export const BUILD_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAptTBUPRUO5Qjqo3vlJj5
EAzK68DtcCdmwc4fFl7vHC79CUfANdDLwRSGU+2GYkmXhJ9Q6ye3mXHyVMQWVoNh
vYJjmaq2cyRBuQZpdPEBmzCxt/mQBygrflRFRFZMlbNyKResTEHCjV2alz5CpGOG
Mny5oI8bx8BPxLqg1hAIGzP+H2abtbDco1E/9NbheTSd0GlKyJePOYgrc6/sAW8E
9EzALHmAFbhUhuDDm5LZnOAgnOL6YemGsD5L0CDaFQ1akfw4JIglpQz/yjo2cC6O
aoCDm/QhbQp3+ie8erzQ7uGqvjOMXb1dIk7NVl+DSxRXnxq9Vaukdo/JcBmoG/hj
baKFelmGLGlocP21JfOaqmiZ02i4wc56Yl2lA+yXecLR0Qy7gz0oaWUxxVd64RSt
VnC87eq1WQUcvMN/Il6xZ5bpqRJ7CRLOGp8onGvwane0xY0zC/vA/x2s8n6XUtA1
jLEvD3ccwarUGlUqDmTNF2Eyq//nE9zqLsWOGc98b+uXAgMBAAE=
-----END PUBLIC KEY-----`;
