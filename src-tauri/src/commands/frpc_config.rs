use crate::models::TunnelConfig;
use std::fmt::Write;

pub(crate) fn generate_frpc_config(config: &TunnelConfig) -> Result<String, String> {
    let mut content = String::new();

    writeln!(content, "[common]").unwrap();
    writeln!(content, "server_addr = {}", config.server_addr).unwrap();
    writeln!(content, "server_port = {}", config.server_port).unwrap();

    if let Some(ref proxy_url) = config.http_proxy {
        writeln!(content, "http_proxy = {}", proxy_url).unwrap();
    }

    writeln!(content, "log_level = {}", config.log_level).unwrap();
    writeln!(content, "tls_enable = {}", config.force_tls).unwrap();
    writeln!(content, "tcp_mux = true").unwrap();
    writeln!(content, "pool_count = 5").unwrap();

    if config.kcp_optimization && (config.tunnel_type == "tcp" || config.tunnel_type == "udp") {
        writeln!(content, "protocol = kcp").unwrap();
    }

    writeln!(content, "user = {}", config.user_token).unwrap();
    writeln!(content, "token = {}", config.node_token).unwrap();
    writeln!(content).unwrap();

    writeln!(content, "[{}]", config.tunnel_name).unwrap();
    writeln!(content, "type = {}", config.tunnel_type).unwrap();
    writeln!(content, "local_ip = {}", config.local_ip).unwrap();
    writeln!(content, "local_port = {}", config.local_port).unwrap();

    match config.tunnel_type.as_str() {
        "tcp" | "udp" => {
            if let Some(remote_port) = config.remote_port {
                writeln!(content, "remote_port = {}", remote_port).unwrap();
            } else {
                return Err("TCP/UDP 隧道缺少 remote_port 参数".to_string());
            }
        }
        "http" | "https" => {
            if let Some(ref custom_domains) = config.custom_domains {
                writeln!(content, "custom_domains = {}", custom_domains).unwrap();
            } else {
                return Err("HTTP/HTTPS 隧道缺少 custom_domains 参数".to_string());
            }
        }
        _ => {
            return Err(format!("不支持的隧道类型: {}", config.tunnel_type));
        }
    }

    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::generate_frpc_config;
    use crate::models::TunnelConfig;

    #[test]
    fn tcp_config_requires_and_writes_remote_port() {
        let config = TunnelConfig {
            tunnel_id: 1,
            tunnel_name: "test".to_string(),
            user_token: "user".to_string(),
            server_addr: "example.test".to_string(),
            server_port: 7000,
            node_token: "token".to_string(),
            tunnel_type: "tcp".to_string(),
            local_ip: "127.0.0.1".to_string(),
            local_port: 25565,
            remote_port: Some(51598),
            custom_domains: None,
            http_proxy: None,
            log_level: "info".to_string(),
            force_tls: false,
            kcp_optimization: false,
        };

        let generated = generate_frpc_config(&config).expect("config should generate");
        assert!(generated.contains("remote_port = 51598"));
    }
}
