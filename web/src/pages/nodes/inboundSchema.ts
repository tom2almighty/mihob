import type { TFunction } from "i18next"
import { z } from "zod"

export function createInboundSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(1, t("nodes.inbound.validation.nameRequired")),
    tag: z.string().trim().optional(),
    protocol: z.enum(["vless", "vmess", "trojan", "hysteria2", "tuic", "anytls", "shadowsocks"]),
    port: z.coerce
      .number()
      .int()
      .min(1, t("nodes.inbound.validation.portRange"))
      .max(65535, t("nodes.inbound.validation.portRange")),
    listen: z.string().trim(),
    cert_id: z.string().optional(),
    enabled: z.boolean(),
    security: z.enum(["none", "tls", "reality"]),
    sni: z.string().trim().optional(),
    skip_cert_verify: z.boolean(),
    network: z.enum(["tcp", "ws", "grpc", "xhttp"]),
    ws_path: z.string().trim().optional(),
    grpc_service_name: z.string().trim().optional(),
    xhttp_path: z.string().trim().optional(),
    flow: z.string().trim().optional(),
    reality_dest: z.string().trim().optional(),
    reality_server_names: z.string().trim().optional(),
    reality_private_key: z.string().trim().optional(),
    reality_public_key: z.string().trim().optional(),
    reality_short_ids: z.string().trim().optional(),
    up_mbps: z.coerce.number().int().min(0).optional(),
    down_mbps: z.coerce.number().int().min(0).optional(),
    obfs: z.string().trim().optional(),
    obfs_password: z.string().trim().optional(),
    hop_ports: z.string().trim().optional(),
    congestion_controller: z.string().trim().optional(),
    ss_cipher: z.string().trim().optional(),
    ss_server_password: z.string().trim().optional(),
  })
}

export type InboundFormValues = z.infer<ReturnType<typeof createInboundSchema>>
