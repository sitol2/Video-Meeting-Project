import sys
import io
import whisper
import warnings

# Fix Unicode encoding issues on Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Suppress warnings (like FP16 warning on CPU)
warnings.filterwarnings("ignore")

def transcribe_audio(file_path):
    try:
        # Load the model
        # "medium" is larger (~1.5GB) but significantly smarter for Tagalog
        model = whisper.load_model("medium")
        
        # Transcribe
        # language="tl" forces Tagalog (which handles Taglish well)
        # initial_prompt gives context for mixed language (using Tagalog words in prompt helps)
        result = model.transcribe(
            file_path, 
            language="tl", 
            initial_prompt="Ang usapang ito ay halo ng Tagalog at English. This is a Taglish conversation."
        )
        
        # Print the text to stdout so Node.js can capture it
        # Ensure UTF-8 encoding
        print(result["text"].strip(), flush=True)
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python transcribe.py <audio_file_path>", file=sys.stderr)
        sys.exit(1)
        
    audio_file = sys.argv[1]
    transcribe_audio(audio_file)