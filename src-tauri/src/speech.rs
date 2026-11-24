use std::io::{self, ErrorKind, Write};
use std::process::{Command, Stdio};

pub fn synthesize(text: &str, language: &str) -> io::Result<Vec<u8>> {
    let voice = match language {
        "en-US" => "en-us",
        "zh-CN" => "cmn",
        _ => return Err(ErrorKind::InvalidInput.into()),
    };
    if text.trim().is_empty() || text.len() > 16_384 {
        return Err(ErrorKind::InvalidInput.into());
    }
    let mut child = Command::new("espeak-ng")
        .args(["-v", voice, "--stdin", "--stdout"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let write_result = child.stdin.take().unwrap().write_all(text.as_bytes());
    let output = child.wait_with_output()?;
    write_result?;
    if !output.status.success() {
        return Err(io::Error::other("eSpeak NG synthesis failed"));
    }
    finish_wav(output.stdout)
}

fn finish_wav(mut wav: Vec<u8>) -> io::Result<Vec<u8>> {
    if wav.len() <= 44
        || &wav[..4] != b"RIFF"
        || &wav[8..16] != b"WAVEfmt "
        || &wav[36..40] != b"data"
    {
        return Err(ErrorKind::InvalidData.into());
    }
    // eSpeak writes placeholder lengths when WAV is streamed to stdout.
    let size = u32::try_from(wav.len()).map_err(|_| ErrorKind::InvalidData)?;
    wav[4..8].copy_from_slice(&(size - 8).to_le_bytes());
    wav[40..44].copy_from_slice(&(size - 44).to_le_bytes());
    Ok(wav)
}

#[cfg(test)]
mod tests {
    use super::finish_wav;

    #[test]
    fn fills_in_streamed_wave_lengths_for_desktop_playback() {
        let mut wav = vec![0; 48];
        wav[..4].copy_from_slice(b"RIFF");
        wav[8..16].copy_from_slice(b"WAVEfmt ");
        wav[36..40].copy_from_slice(b"data");
        let wav = finish_wav(wav).unwrap();
        assert_eq!(&wav[4..8], &40_u32.to_le_bytes());
        assert_eq!(&wav[40..44], &4_u32.to_le_bytes());
    }

    #[test]
    fn rejects_an_empty_synthesis_result() {
        assert!(finish_wav(Vec::new()).is_err());
    }
}
