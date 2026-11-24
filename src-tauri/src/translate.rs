use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize, Serialize)]
pub struct TranslateRequest {
    text: String,
    direction: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Translation {
    text: String,
    from: String,
    to: String,
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
}

pub fn client(timeout: Duration) -> reqwest::Result<Client> {
    Client::builder().timeout(timeout).redirect(reqwest::redirect::Policy::none()).build()
}

pub async fn send(client: &Client, endpoint: &str, request: TranslateRequest) -> Result<Translation, CommandError> {
    let response = client.post(endpoint).json(&request).send().await.map_err(|_| unavailable())?;
    let code = match response.status() {
        StatusCode::OK => return response.json().await.map_err(|_| unavailable()),
        StatusCode::BAD_REQUEST => "invalid_input",
        StatusCode::UNPROCESSABLE_ENTITY => "unsupported_language",
        StatusCode::TOO_MANY_REQUESTS => "rate_limited",
        _ => "unavailable",
    };
    Err(CommandError { code })
}

pub fn unavailable() -> CommandError {
    CommandError { code: "unavailable" }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn stub(delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/v1/translate", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let mut buffer = [0; 2048];
            let _ = stream.read(&mut buffer);
            std::thread::sleep(delay);
            let response = r#"{"text":"apple","from":"zh","to":"en"}"#;
            let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", response.len(), response);
        });
        endpoint
    }

    #[tokio::test]
    async fn accepts_translation_json() {
        let endpoint = stub(Duration::ZERO);
        let request = TranslateRequest { text: "苹果".into(), direction: "zh-en".into() };
        let client = client(Duration::from_secs(2)).unwrap();
        assert_eq!(send(&client, &endpoint, request).await.unwrap().text, "apple");
    }

    #[tokio::test]
    async fn maps_timeout_to_unavailable() {
        let endpoint = stub(Duration::from_millis(120));
        let request = TranslateRequest { text: "苹果".into(), direction: "auto".into() };
        let client = client(Duration::from_millis(30)).unwrap();
        assert_eq!(send(&client, &endpoint, request).await.unwrap_err().code, "unavailable");
    }
}
