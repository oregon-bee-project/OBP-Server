# devtools::load_all('.') # May have wrong path or be superfluous

args <- commandArgs(trailingOnly=TRUE)

if (length(args) < 4) {
  stop("Required args: plant_list, occurrences, observations, output-directory")
}

print(args)

cat("1", args[1], "\n")
cat("2", args[2], "\n")
cat("3", args[3], "\n")
cat("4", args[4], "\n")
print("Done!")
