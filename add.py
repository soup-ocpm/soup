import pandas as pd

def add_unique_id_column(input_csv, output_csv, column_name="Event_ID"):
    # Read the input CSV file into a DataFrame
    df = pd.read_csv(input_csv)
    
    # Add a new column with unique incremental values
    df[column_name] = range(1, len(df) + 1)
    
    # Write the updated DataFrame to a new CSV file
    df.to_csv(output_csv, index=False)
    print(f"Unique ID column added and saved to {output_csv}")

# Example usage
input_csv = "C://Users//User//Desktop//1-15aug18.csv"
output_csv = "bpi-output.csv"
add_unique_id_column(input_csv, output_csv)
