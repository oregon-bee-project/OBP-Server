#Function to speed up spatial matching using "covers" instead of "within"
st_within_fast <- function(x,y){
  temp <- st_covers(y,x)
  m <- rep(NA,nrow(x)) #No matches = NA
  for(i in 1:length(temp)) m[temp[[i]]] <- i
  return(m)
}
