fn main() {
    println!("cargo:rerun-if-env-changed=TRANSLATION_ENDPOINT");
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let value = std::env::var("TRANSLATION_ENDPOINT").unwrap_or_default();
        let valid = url::Url::parse(&value).is_ok_and(|endpoint| {
            endpoint.scheme() == "https"
                && endpoint.host().is_some()
                && endpoint.path() == "/v1/translate"
                && endpoint.username().is_empty()
                && endpoint.password().is_none()
                && endpoint.query().is_none()
                && endpoint.fragment().is_none()
        });
        assert!(valid, "Set TRANSLATION_ENDPOINT to the HTTPS URL ending in /v1/translate for a release build.");
    }
    tauri_build::build();
}
