#Finds x matches in 'synonym', and replaces them with 'name'
replaceSynonyms <- function(x,name,synonym){
  
  if(any(is.na(name))|any(name=='')) stop('NAs or blanks found in replacement names')
  if(length(name)!=length(synonym)) stop('replacement names and synonyms vectors are not the same length')
  name <- name[!is.na(synonym)&!synonym=='']; synonym <- synonym[!is.na(synonym)&!synonym==''] #Remove NAs/blanks
  synonym <- strsplit(synonym,',\\s*') #Split synonyms
  name <- rep(name,sapply(synonym,length)) #Replicate names over length of synonyms
  synonym <- unlist(synonym)
  # cbind(name,synonym)
  
  nmMatch <- match(x,synonym,nomatch = 0) #Makes matching indices
  xMatch <- which(nmMatch!=0)
  nmMatch <- nmMatch[nmMatch!=0]
  x[xMatch] <- name[nmMatch]
  
  message(paste0('Replaced synonyms:\n',
                 paste0(apply(unique(cbind(name,synonym)),1,paste,collapse=' -> '),
                        collapse='\n')))
  return(x)
}
