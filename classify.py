import sys
import json
import warnings
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import nltk
from nltk.tokenize import sent_tokenize

# Suppress warnings
warnings.filterwarnings("ignore")

# Download NLTK data for sentence tokenization (run once)
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

class InterviewClassifier:
    """
    Classifies interview transcript segments into 8 categories:
    Academic, Career, Faculty, Infrastructure, Mental Health, 
    Practicum/OJT, Social, Technology
    """
    
    def __init__(self, model_path="./my_bert_model/my_bert_model"):
        """
        Initialize the classifier with the fine-tuned BERT model.
        
        Args:
            model_path: Path to the model directory
        """
        self.model_path = Path(model_path)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        print(f"Loading BERT model from {self.model_path}...", file=sys.stderr)
        print(f"Using device: {self.device}", file=sys.stderr)
        
        # Load tokenizer and model
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_path)
        self.model.to(self.device)
        self.model.eval()
        
        # Category labels from config
        self.categories = [
            "Academic",
            "Career", 
            "Faculty",
            "Infrastructure",
            "Mental Health",
            "Practicum/OJT",
            "Social",
            "Technology"
        ]
        
        print("Model loaded successfully!", file=sys.stderr)
    
    def segment_text(self, text):
        """
        Split text into sentences using NLTK.
        
        Args:
            text: Raw transcript text
            
        Returns:
            List of sentences
        """
        # Handle empty or very short text
        if not text or len(text.strip()) < 5:
            return []
        
        # Use NLTK for sentence tokenization
        sentences = sent_tokenize(text)
        
        # Filter out very short sentences (likely noise)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
        
        return sentences
    
    def classify_segment(self, text):
        """
        Classify a single text segment.
        
        Args:
            text: Text segment to classify
            
        Returns:
            dict: {category, confidence}
        """
        # Tokenize input
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        )
        
        # Move to device
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        # Get prediction
        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits
            
        # Get probabilities
        probs = torch.softmax(logits, dim=-1)
        confidence, predicted_class = torch.max(probs, dim=-1)
        
        category = self.categories[predicted_class.item()]
        confidence_score = confidence.item()
        
        return {
            "category": category,
            "confidence": round(confidence_score, 4)
        }
    
    def classify_segments_batch(self, segments, batch_size=8):
        """
        Classify multiple segments in batches for efficiency.
        
        Args:
            segments: List of text segments
            batch_size: Number of segments to process at once
            
        Returns:
            List of classification results
        """
        results = []
        
        for i in range(0, len(segments), batch_size):
            batch = segments[i:i + batch_size]
            
            # Tokenize batch
            inputs = self.tokenizer(
                batch,
                return_tensors="pt",
                truncation=True,
                max_length=512,
                padding=True
            )
            
            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Get predictions
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
            
            # Get probabilities
            probs = torch.softmax(logits, dim=-1)
            confidences, predicted_classes = torch.max(probs, dim=-1)
            
            # Store results
            for j, (pred_class, conf) in enumerate(zip(predicted_classes, confidences)):
                results.append({
                    "category": self.categories[pred_class.item()],
                    "confidence": round(conf.item(), 4)
                })
        
        return results
    
    def classify_transcript(self, transcript_text):
        """
        Classify an entire transcript.
        
        Args:
            transcript_text: Full transcript text
            
        Returns:
            dict: Classification results with segments and summary
        """
        # Segment the text
        segments = self.segment_text(transcript_text)
        
        if not segments:
            return {
                "total_segments": 0,
                "categories": {},
                "segments": []
            }
        
        print(f"Processing {len(segments)} segments...", file=sys.stderr)
        
        # Classify all segments (batch processing)
        classifications = self.classify_segments_batch(segments)
        
        # Build detailed results
        detailed_segments = []
        category_counts = {}
        
        for idx, (segment_text, classification) in enumerate(zip(segments, classifications)):
            category = classification["category"]
            confidence = classification["confidence"]
            
            # Count categories
            category_counts[category] = category_counts.get(category, 0) + 1
            
            # Store detailed segment info
            detailed_segments.append({
                "index": idx,
                "text": segment_text,
                "category": category,
                "confidence": confidence
            })
        
        # Calculate percentages
        total = len(segments)
        category_percentages = {
            cat: round((count / total) * 100, 1) 
            for cat, count in category_counts.items()
        }
        
        return {
            "total_segments": total,
            "categories": category_counts,
            "category_percentages": category_percentages,
            "segments": detailed_segments
        }


def main():
    """
    Main function to run classification from command line.
    Usage: python classify.py <transcript_file_path>
    """
    if len(sys.argv) < 2:
        print("Usage: python classify.py <transcript_file_path>", file=sys.stderr)
        sys.exit(1)
    
    transcript_file = sys.argv[1]
    
    # Check if file exists
    if not Path(transcript_file).exists():
        print(f"Error: File not found: {transcript_file}", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Read transcript
        with open(transcript_file, 'r', encoding='utf-8') as f:
            transcript_text = f.read()
        
        # Initialize classifier
        classifier = InterviewClassifier()
        
        # Classify transcript
        results = classifier.classify_transcript(transcript_text)
        
        # Output results as JSON to stdout
        print(json.dumps(results, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
